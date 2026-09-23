import { useMemo, useState } from 'react';
import Icon from './Icon';
import { useAppStore } from '../store/appStore';
import { buildReportCategoryTotals, buildRoomSummaries } from '../lib/quantities';
import { exportQuantitiesToExcel } from '../lib/exportExcel';
import { exportQuantitiesToPdf, getExportablePageNumbers } from '../lib/exportQuantitiesPdf';

/**
 * The two actions that produce BetterCalc's main deliverable — the quantity report — plus their
 * page-selection dialogs. Extracted from the quantities tab so the exact same behaviour can be
 * offered from the top bar's export menu as well, without a second implementation.
 *
 * `variant` only changes the trigger markup: 'menu' renders menu items for TopBarMenu, 'buttons'
 * renders the toolbar buttons the quantities tab has always had.
 */
export default function QuantityExportActions({ variant, onPicked }: { variant: 'menu' | 'buttons'; onPicked?: () => void }) {
  const project = useAppStore((s) => s.project);
  const currentPage = useAppStore((s) => s.currentPage);
  const annotationsVisible = useAppStore((s) => s.annotationsVisible);
  const measurementsVisible = useAppStore((s) => s.measurementsVisible);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pageDialogPages, setPageDialogPages] = useState<Set<number> | null>(null);
  const [excelDialog, setExcelDialog] = useState<{ mode: 'specific' | 'all'; page: number } | null>(null);

  const summaries = useMemo(() => (project ? buildRoomSummaries(project) : []), [project]);

  if (!project) return null;

  const hasAreaMeasurements = (project.measurements ?? []).some((m) => m.tool === 'area' && m.areaKind);
  const canExport = summaries.length > 0 || hasAreaMeasurements;
  const exportablePages = getExportablePageNumbers(project);

  const runExportExcel = async (pageNumbers: number[]) => {
    setExportingExcel(true);
    try {
      const roomPageById = new Map(project.rooms.map((r) => [r.id, r.pageNumber]));
      const pageSet = new Set(pageNumbers);
      const filteredSummaries = summaries.filter((s) => pageSet.has(roomPageById.get(s.roomId) ?? -1));
      const filteredTotals = buildReportCategoryTotals(project, filteredSummaries);
      const filteredAreaMeasurements = (project.measurements ?? []).filter(
        (m) => m.tool === 'area' && m.areaKind && typeof m.areaM2 === 'number' && pageSet.has(m.pageNumber)
      );
      await exportQuantitiesToExcel(project, filteredSummaries, filteredTotals, filteredAreaMeasurements);
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportExcel = () => {
    onPicked?.();
    if (exportablePages.length <= 1) {
      void runExportExcel(exportablePages);
      return;
    }
    setExcelDialog({ mode: 'specific', page: exportablePages.includes(currentPage) ? currentPage : exportablePages[0] });
  };

  const runExportPdf = async (pageNumbers: number[]) => {
    setExportingPdf(true);
    try {
      const roomPageById = new Map(project.rooms.map((r) => [r.id, r.pageNumber]));
      const pageSet = new Set(pageNumbers);
      const filteredSummaries = summaries.filter((s) => pageSet.has(roomPageById.get(s.roomId) ?? -1));
      const filteredTotals = buildReportCategoryTotals(project, filteredSummaries);
      await exportQuantitiesToPdf(project, filteredSummaries, filteredTotals, annotationsVisible, pageNumbers, measurementsVisible);
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportPdf = () => {
    onPicked?.();
    if (exportablePages.length <= 1) {
      void runExportPdf(exportablePages);
      return;
    }
    setPageDialogPages(new Set(exportablePages.includes(currentPage) ? [currentPage] : exportablePages));
  };

  return (
    <>
      {variant === 'menu' ? (
        <>
          <button className="menu-item" onClick={handleExportExcel} disabled={!canExport || exportingExcel}>
            <span className="menu-check">
              <Icon name="sheet" size={13} />
            </span>
            {exportingExcel ? 'מייצא…' : 'כתב כמויות — Excel'}
          </button>
          <button className="menu-item" onClick={handleExportPdf} disabled={!canExport || exportingPdf}>
            <span className="menu-check">
              <Icon name="file" size={13} />
            </span>
            {exportingPdf ? 'מייצא…' : 'כתב כמויות — PDF'}
          </button>
        </>
      ) : (
        <>
          <button className="btn-secondary small" onClick={handleExportPdf} disabled={!canExport || exportingPdf}>
            <Icon name="file" />
            {exportingPdf ? 'מייצא…' : 'ייצוא ל-PDF'}
          </button>
          <button className="btn-primary small" onClick={handleExportExcel} disabled={!canExport || exportingExcel}>
            <Icon name="sheet" />
            {exportingExcel ? 'מייצא…' : 'ייצוא לאקסל'}
          </button>
        </>
      )}

      {pageDialogPages && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>איזה עמודים לייצא?</h3>
            <p>בחר אילו עמודי תוכנית לכלול בדוח ה-PDF.</p>
            <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: 0 }}>
              <button className="btn-secondary small" onClick={() => setPageDialogPages(new Set(exportablePages))}>
                בחר הכל
              </button>
              <button className="btn-secondary small" onClick={() => setPageDialogPages(new Set())}>
                נקה בחירה
              </button>
            </div>
            <ul className="page-checkbox-list">
              {exportablePages.map((p) => (
                <li key={p}>
                  <label>
                    <input
                      type="checkbox"
                      checked={pageDialogPages.has(p)}
                      onChange={(e) => {
                        const next = new Set(pageDialogPages);
                        if (e.target.checked) next.add(p);
                        else next.delete(p);
                        setPageDialogPages(next);
                      }}
                    />
                    עמוד {p}
                    {p === currentPage ? ' (נוכחי)' : ''}
                  </label>
                </li>
              ))}
            </ul>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setPageDialogPages(null)}>
                ביטול
              </button>
              <button
                className="btn-primary"
                disabled={pageDialogPages.size === 0}
                onClick={() => {
                  const pages = Array.from(pageDialogPages).sort((a, b) => a - b);
                  setPageDialogPages(null);
                  void runExportPdf(pages);
                }}
              >
                ייצוא
              </button>
            </div>
          </div>
        </div>
      )}

      {excelDialog && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>איזה עמודים לייצא?</h3>
            <p>בחר עמוד ספציפי לייצוא, או את כל העמודים בטבלה מסכמת אחת.</p>
            <div className="form-row">
              <label>
                <input
                  type="radio"
                  name="excel-export-mode"
                  checked={excelDialog.mode === 'specific'}
                  onChange={() => setExcelDialog({ ...excelDialog, mode: 'specific' })}
                />{' '}
                עמוד ספציפי
              </label>
              {excelDialog.mode === 'specific' && (
                <select
                  value={excelDialog.page}
                  onChange={(e) => setExcelDialog({ ...excelDialog, page: parseInt(e.target.value, 10) })}
                >
                  {exportablePages.map((p) => (
                    <option key={p} value={p}>
                      עמוד {p}
                      {p === currentPage ? ' (נוכחי)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="form-row">
              <label>
                <input
                  type="radio"
                  name="excel-export-mode"
                  checked={excelDialog.mode === 'all'}
                  onChange={() => setExcelDialog({ ...excelDialog, mode: 'all' })}
                />{' '}
                כל העמודים (טבלה מסכמת)
              </label>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setExcelDialog(null)}>
                ביטול
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  const pages = excelDialog.mode === 'all' ? exportablePages : [excelDialog.page];
                  setExcelDialog(null);
                  void runExportExcel(pages);
                }}
              >
                ייצוא
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
