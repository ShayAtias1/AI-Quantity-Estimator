import { useMemo, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { buildReportCategoryTotals, buildRoomSummaries } from '../lib/quantities';
import { REPORT_CATEGORY_LABELS } from '../types';
import { exportQuantitiesToExcel } from '../lib/exportExcel';
import { exportQuantitiesToPdf, getExportablePageNumbers } from '../lib/exportQuantitiesPdf';

const DASH = '—';

export default function QuantityTable() {
  const project = useAppStore((s) => s.project);
  const currentPage = useAppStore((s) => s.currentPage);
  const annotationsVisible = useAppStore((s) => s.annotationsVisible);
  const measurementsVisible = useAppStore((s) => s.measurementsVisible);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pageDialogPages, setPageDialogPages] = useState<Set<number> | null>(null);
  const [excelDialog, setExcelDialog] = useState<{ mode: 'specific' | 'all'; page: number } | null>(null);

  const summaries = useMemo(() => (project ? buildRoomSummaries(project) : []), [project]);
  const totals = useMemo(() => (project ? buildReportCategoryTotals(project, summaries) : []), [project, summaries]);

  if (!project) return null;

  const hasAreaMeasurements = (project.measurements ?? []).some((m) => m.tool === 'area' && m.areaKind);
  const canExportPdf = summaries.length > 0 || hasAreaMeasurements;
  const canExportExcel = summaries.length > 0 || hasAreaMeasurements;
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
    if (exportablePages.length <= 1) {
      void runExportPdf(exportablePages);
      return;
    }
    setPageDialogPages(new Set(exportablePages.includes(currentPage) ? [currentPage] : exportablePages));
  };

  return (
    <div className="quantity-table-wrap">
      <div className="quantity-table-toolbar">
        <h4>טבלת כמויות</h4>
        <div className="quantity-table-toolbar-actions">
          <button className="btn-secondary" onClick={handleExportPdf} disabled={!canExportPdf || exportingPdf}>
            {exportingPdf ? 'מייצא…' : '⬇ ייצוא ל-PDF'}
          </button>
          <button className="btn-primary" onClick={handleExportExcel} disabled={!canExportExcel || exportingExcel}>
            {exportingExcel ? 'מייצא…' : '⬇ ייצוא לאקסל'}
          </button>
        </div>
      </div>

      {pageDialogPages && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>איזה עמודים לייצא?</h3>
            <p>בחר אילו עמודי תוכנית לכלול בדוח ה-PDF.</p>
            <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: 0 }}>
              <button
                className="btn-secondary small"
                onClick={() => setPageDialogPages(new Set(exportablePages))}
              >
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

      {summaries.length === 0 ? (
        <p className="muted">
          אין עדיין כמויות חדרים לחישוב. סמן חדרים על התוכנית.
          {hasAreaMeasurements && ' יש לך סימוני הריסה/בנייה — ייצוא ה-PDF וה-Excel יכללו אותם.'}
        </p>
      ) : (
        <>
          <div className="qty-table-scroll">
            <table className="qty-table">
              <thead>
                <tr>
                  <th>דירה</th>
                  <th>חדר</th>
                  <th>שטח ריצוף רגיל</th>
                  <th>שטח ריצוף AS</th>
                  <th>שטח חיפוי</th>
                  <th>שטח פנלים</th>
                  <th>פחת ריצוף רגיל %</th>
                  <th>פחת ריצוף AS %</th>
                  <th>פחת חיפוי %</th>
                  <th>פחת פנלים %</th>
                  <th>ריצוף רגיל להזמנה</th>
                  <th>ריצוף AS להזמנה</th>
                  <th>חיפוי להזמנה</th>
                  <th>פנלים להזמנה</th>
                  <th>הערות</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((s) => (
                  <tr key={s.roomId}>
                    <td>{s.apartmentNumber || DASH}</td>
                    <td>{s.roomName}</td>
                    <td>{s.tilingRegularAreaM2 ?? DASH}</td>
                    <td>{s.tilingAsAreaM2 ?? DASH}</td>
                    <td>{s.claddingAreaM2 ?? DASH}</td>
                    <td>{s.panelsAreaM2 ?? DASH}</td>
                    <td>{s.tilingRegularWastePercent != null ? `${s.tilingRegularWastePercent}%` : DASH}</td>
                    <td>{s.tilingAsWastePercent != null ? `${s.tilingAsWastePercent}%` : DASH}</td>
                    <td>{s.claddingWastePercent != null ? `${s.claddingWastePercent}%` : DASH}</td>
                    <td>{s.panelsWastePercent != null ? `${s.panelsWastePercent}%` : DASH}</td>
                    <td>{s.tilingRegularOrderM2 != null ? <strong>{s.tilingRegularOrderM2}</strong> : DASH}</td>
                    <td>{s.tilingAsOrderM2 != null ? <strong>{s.tilingAsOrderM2}</strong> : DASH}</td>
                    <td>{s.claddingOrderM2 != null ? <strong>{s.claddingOrderM2}</strong> : DASH}</td>
                    <td>{s.panelsOrderM2 != null ? <strong>{s.panelsOrderM2}</strong> : DASH}</td>
                    <td>{s.notes || DASH}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="qty-summary">
            <h4 className="qty-totals-title">סה"כ</h4>
            <table className="qty-summary-table">
              <thead>
                <tr>
                  <th>פריט</th>
                  <th>כמות נטו (מ"ר)</th>
                  <th>פחת</th>
                  <th>להזמנה (מ"ר)</th>
                </tr>
              </thead>
              <tbody>
                {totals.map((t) => (
                  <tr key={t.category}>
                    <td>{REPORT_CATEGORY_LABELS[t.category]}</td>
                    <td>{t.quantityM2}</td>
                    <td>{t.wastePercent}%</td>
                    <td>
                      <strong>{t.orderM2}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
