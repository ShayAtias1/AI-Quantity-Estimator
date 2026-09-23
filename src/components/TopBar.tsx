import { useEffect, useState } from 'react';
import { selectSaveState, useAppStore } from '../store/appStore';
import QuantityExportActions from './QuantityExportActions';
import TopBarMenu, { type MenuId } from './TopBarMenu';
import Icon, { type IconName } from './Icon';
import { exportAllPlanPagesToPdf, exportPlanPageToPdf } from '../lib/exportRegionPdf';

export default function TopBar() {
  const project = useAppStore((s) => s.project);
  const setProject = useAppStore((s) => s.setProject);
  const currentPage = useAppStore((s) => s.currentPage);
  const numPages = useAppStore((s) => s.numPages);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const updateProjectMeta = useAppStore((s) => s.updateProjectMeta);
  const persist = useAppStore((s) => s.persist);
  const saveState = useAppStore(selectSaveState);
  const annotationsVisible = useAppStore((s) => s.annotationsVisible);
  const toggleAnnotationsVisible = useAppStore((s) => s.toggleAnnotationsVisible);
  const measurementsVisible = useAppStore((s) => s.measurementsVisible);
  const toggleMeasurementsVisible = useAppStore((s) => s.toggleMeasurementsVisible);
  const canUndo = useAppStore((s) => s.history.length > 0);
  const canRedo = useAppStore((s) => s.future.length > 0);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const toolMode = useAppStore((s) => s.toolMode);
  const setToolMode = useAppStore((s) => s.setToolMode);
  const exportRegions = useAppStore((s) => s.exportRegions);
  const setExportRegion = useAppStore((s) => s.setExportRegion);
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const [exportingPage, setExportingPage] = useState(false);
  const [exportingAllPages, setExportingAllPages] = useState(false);
  // Draft text of the page box. Kept as a string so the field can be empty/mid-typing, and re-synced
  // whenever the page changes some other way (prev/next buttons, clicking a room in the list).
  const [pageInput, setPageInput] = useState(String(currentPage));
  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  // Enter (via blur) jumps to the typed page: out-of-range values clamp, anything unparsable just
  // snaps the box back to the current page. Goes through the same setCurrentPage as prev/next.
  const commitPageJump = () => {
    const parsed = parseInt(pageInput, 10);
    if (!Number.isFinite(parsed)) {
      setPageInput(String(currentPage));
      return;
    }
    const target = Math.min(Math.max(parsed, 1), numPages);
    setPageInput(String(target));
    if (target !== currentPage) setCurrentPage(target);
  };

  if (!project) return null;

  const exportRegion = exportRegions[currentPage] ?? null;
  const exporting = exportingPage || exportingAllPages;

  // Just this page — cropped to its export region if one was chosen for it, full page otherwise.
  const handleExportPage = async () => {
    setOpenMenu(null);
    setExportingPage(true);
    try {
      await exportPlanPageToPdf(project, currentPage, exportRegion, annotationsVisible, measurementsVisible);
    } finally {
      setExportingPage(false);
    }
  };

  // Every page in one PDF — each page cropped to its own export region if one was chosen, full page otherwise.
  const handleExportAllPages = async () => {
    setOpenMenu(null);
    setExportingAllPages(true);
    try {
      await exportAllPlanPagesToPdf(project, numPages, exportRegions, annotationsVisible, measurementsVisible);
    } finally {
      setExportingAllPages(false);
    }
  };

  const closeProject = async () => {
    await persist();
    // If the save failed the work is still only in memory — stay in the project rather than drop it.
    if (useAppStore.getState().saveError) return;
    setProject(null);
  };

  // The save state was already tracked; it is shown in the bar, but quietly — it is a status,
  // not an action, so only the states that need attention carry colour.
  const saveLabels: Record<typeof saveState, { text: string; title: string; icon: IconName }> = {
    saving: { text: 'שומר…', title: 'שומר את הפרויקט', icon: 'reset' },
    saved: { text: 'נשמר', title: 'כל השינויים נשמרו', icon: 'check' },
    unsaved: { text: 'לא נשמר', title: 'יש שינויים שטרם נשמרו', icon: 'alert' },
    error: { text: 'שגיאה בשמירה', title: 'השמירה נכשלה — העבודה לא נשמרה', icon: 'alert' },
  };

  return (
    <div className="top-bar" data-save-state={saveState}>
      {/* Group 1 — identity. Compressed to the mark plus the project name: the workspace itself
          says which mode we are in, so the subtitle no longer spends space here. */}
      <div className="top-bar-group identity">
        <div className="app-brand" title="BetterCalc — חישוב כמויות">
          <span className="app-brand-name">BetterCalc</span>
        </div>
        <input
          className="project-name-input"
          value={project.name}
          onChange={(e) => updateProjectMeta({ name: e.target.value })}
          title="שם הפרויקט"
        />
      </div>

      {/* Group 2 — the document: where we are in it, and moving through its history. */}
      <div className="top-bar-group grow">
        {/* The page is dir="rtl", so previous sits on the right and next on the left. */}
        <div className="page-nav">
          <button disabled={currentPage <= 1} onClick={() => setCurrentPage(currentPage - 1)} title="עמוד קודם">
            <Icon name="chevron-right" />
          </button>
          <span>
            עמוד
            <input
              className="page-jump-input"
              type="number"
              min={1}
              max={numPages}
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              onBlur={commitPageJump}
              title={`הקלד מספר עמוד (1 עד ${numPages}) ולחץ Enter`}
            />
            / {numPages}
          </span>
          {/* Calibration state is not repeated here — the page-status strip above the sidebar tabs
              is the single place that reports it and offers the action. */}
          <button disabled={currentPage >= numPages} onClick={() => setCurrentPage(currentPage + 1)} title="עמוד הבא">
            <Icon name="chevron-left" />
          </button>
        </div>

        <span className="top-bar-sep" />

        <div className="undo-redo-group">
          <button className="icon-btn" onClick={undo} disabled={!canUndo} title="בטל פעולה (Ctrl+Z)">
            <Icon name="undo" />
          </button>
          <button className="icon-btn" onClick={redo} disabled={!canRedo} title="בצע שוב (Ctrl+Shift+Z)">
            <Icon name="redo" />
          </button>
        </div>
      </div>

      {/* Group 3 — output: what is on the plan, what leaves the app, and the way out. */}
      <div className="top-bar-group output">
        <span className={`save-state save-state-${saveState}`} title={saveLabels[saveState].title}>
          <Icon name={saveLabels[saveState].icon} size={13} />
          {saveLabels[saveState].text}
        </span>

        <TopBarMenu
          id="view"
          openId={openMenu}
          setOpenId={setOpenMenu}
          icon={annotationsVisible && measurementsVisible ? 'eye' : 'eye-off'}
          label="תצוגה"
          variant="ghost"
          title="מה מוצג על גבי התוכנית (ומיוצא ל-PDF)"
          highlighted={!annotationsVisible || !measurementsVisible}
        >
          <button className="menu-item" onClick={toggleAnnotationsVisible}>
            <span className="menu-check">{annotationsVisible && <Icon name="check" size={13} />}</span>
            סימוני שטחים והערות
          </button>
          <button className="menu-item" onClick={toggleMeasurementsVisible}>
            <span className="menu-check">{measurementsVisible && <Icon name="check" size={13} />}</span>
            מדידות
          </button>
          <p className="menu-hint">מה שמוסתר כאן לא ייכלל גם בייצוא ה-PDF.</p>
        </TopBarMenu>

        {/* Export is the strongest action in the bar — the one filled control. */}
        <TopBarMenu
          id="export"
          openId={openMenu}
          setOpenId={setOpenMenu}
          icon="download"
          label={exporting ? 'מייצא…' : 'ייצוא'}
          title="ייצוא כתב הכמויות או התוכנית"
          variant="primary"
          highlighted={!!exportRegion}
        >
          {/* The quantity report is the product's main output, so it heads the menu. */}
          <p className="menu-hint menu-section-title">כתב כמויות</p>
          <QuantityExportActions variant="menu" onPicked={() => setOpenMenu(null)} />

          <div className="menu-divider" />
          <p className="menu-hint menu-section-title">תוכנית מסומנת</p>
          <button className="menu-item" onClick={handleExportPage} disabled={exporting}>
            <span className="menu-check">
              <Icon name="map" size={13} />
            </span>
            {exportRegion ? `האזור שנבחר (עמוד ${currentPage})` : `עמוד ${currentPage} בלבד`}
          </button>
          <button className="menu-item" onClick={handleExportAllPages} disabled={exporting || numPages <= 1}>
            <span className="menu-check">
              <Icon name="layers" size={13} />
            </span>
            כל {numPages} העמודים לקובץ אחד
          </button>
          <button
            className={`menu-item ${toolMode === 'export-region' ? 'active' : ''}`}
            onClick={() => {
              setToolMode(toolMode === 'export-region' ? 'select' : 'export-region');
              setOpenMenu(null);
            }}
          >
            <span className="menu-check">
              <Icon name="crop" size={13} />
            </span>
            {exportRegion ? 'שינוי אזור הייצוא' : 'בחירת אזור לייצוא'}
          </button>
          {exportRegion && (
            <button className="menu-item" onClick={() => setExportRegion(currentPage, null)}>
              <span className="menu-check">
                <Icon name="close" size={13} />
              </span>
              ביטול האזור בעמוד זה
            </button>
          )}
          <p className="menu-hint">
            {exportRegion
              ? 'העמוד הנוכחי ייחתך לאזור שסימנת. עמודים ללא אזור מיוצאים במלואם.'
              : 'ללא אזור נבחר — מיוצא העמוד המלא.'}
          </p>
        </TopBarMenu>

        <button className="btn-ghost small" onClick={closeProject} title="שמירה ויציאה לרשימת הפרויקטים">
          <Icon name="exit" />
          <span className="btn-label">פרויקטים</span>
        </button>
      </div>
    </div>
  );
}
