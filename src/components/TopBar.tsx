import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import TopBarMenu, { type MenuId } from './TopBarMenu';
import { exportAllPlanPagesToPdf, exportPlanPageToPdf } from '../lib/exportRegionPdf';

export default function TopBar() {
  const project = useAppStore((s) => s.project);
  const setProject = useAppStore((s) => s.setProject);
  const currentPage = useAppStore((s) => s.currentPage);
  const numPages = useAppStore((s) => s.numPages);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const updateProjectMeta = useAppStore((s) => s.updateProjectMeta);
  const persist = useAppStore((s) => s.persist);
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
    setProject(null);
  };

  return (
    <div className="top-bar">
      <div className="app-brand">
        <span className="app-brand-name">BetterCalc</span>
        <span className="app-brand-divider">|</span>
        <span className="app-brand-mode">חישוב כמויות</span>
      </div>
      <button className="btn-secondary small" onClick={closeProject}>
        ← פרויקטים
      </button>
      <input
        className="project-name-input"
        value={project.name}
        onChange={(e) => updateProjectMeta({ name: e.target.value })}
      />

      <div className="page-nav">
        <button disabled={currentPage <= 1} onClick={() => setCurrentPage(currentPage - 1)}>
          ›
        </button>
        <span>
          עמוד {currentPage} מתוך {numPages}
        </span>
        <button disabled={currentPage >= numPages} onClick={() => setCurrentPage(currentPage + 1)}>
          ‹
        </button>
      </div>

      <span className="top-bar-sep" />

      <div className="undo-redo-group">
        <button className="btn-secondary small" onClick={undo} disabled={!canUndo} title="בטל פעולה (Ctrl+Z)">
          ↶
        </button>
        <button className="btn-secondary small" onClick={redo} disabled={!canRedo} title="בצע שוב (Ctrl+Shift+Z)">
          ↷
        </button>
      </div>

      <TopBarMenu
        id="view"
        openId={openMenu}
        setOpenId={setOpenMenu}
        label={`${annotationsVisible && measurementsVisible ? '👁' : '🚫'} תצוגה`}
        title="מה מוצג על גבי התוכנית (ומיוצא ל-PDF)"
        highlighted={!annotationsVisible || !measurementsVisible}
      >
        <button className="menu-item" onClick={toggleAnnotationsVisible}>
          <span className="menu-check">{annotationsVisible ? '✓' : ''}</span>
          סימוני שטחים והערות
        </button>
        <button className="menu-item" onClick={toggleMeasurementsVisible}>
          <span className="menu-check">{measurementsVisible ? '✓' : ''}</span>
          מדידות
        </button>
        <p className="menu-hint">מה שמוסתר כאן לא ייכלל גם בייצוא ה-PDF.</p>
      </TopBarMenu>

      <TopBarMenu
        id="export"
        openId={openMenu}
        setOpenId={setOpenMenu}
        label={exporting ? '⬇ מייצא…' : '⬇ ייצוא תוכנית'}
        title="ייצוא התוכנית ל-PDF"
        highlighted={!!exportRegion}
      >
        <button className="menu-item" onClick={handleExportPage} disabled={exporting}>
          <span className="menu-check">📄</span>
          {exportRegion ? `ייצוא האזור שנבחר (עמוד ${currentPage})` : `ייצוא עמוד ${currentPage} בלבד`}
        </button>
        <button className="menu-item" onClick={handleExportAllPages} disabled={exporting || numPages <= 1}>
          <span className="menu-check">📚</span>
          ייצוא כל {numPages} העמודים לקובץ אחד
        </button>
        <div className="menu-divider" />
        <button
          className={`menu-item ${toolMode === 'export-region' ? 'active' : ''}`}
          onClick={() => {
            setToolMode(toolMode === 'export-region' ? 'select' : 'export-region');
            setOpenMenu(null);
          }}
        >
          <span className="menu-check">✂</span>
          {exportRegion ? 'שינוי אזור הייצוא' : 'בחירת אזור לייצוא'}
        </button>
        {exportRegion && (
          <button className="menu-item" onClick={() => setExportRegion(currentPage, null)}>
            <span className="menu-check">✕</span>
            ביטול האזור בעמוד זה
          </button>
        )}
        <p className="menu-hint">
          {exportRegion
            ? 'העמוד הנוכחי ייחתך לאזור שסימנת. עמודים ללא אזור מיוצאים במלואם.'
            : 'ללא אזור נבחר — מיוצא העמוד המלא.'}
        </p>
      </TopBarMenu>

      <TopBarMenu id="settings" openId={openMenu} setOpenId={setOpenMenu} label="⚙ ברירות מחדל" title="ברירות מחדל לחישוב">
        <div className="form-row">
          <label>גובה חיפוי ברירת מחדל (מ')</label>
          <input
            type="number"
            step="0.05"
            min="0"
            value={project.defaultCladdingHeightM}
            onChange={(e) => updateProjectMeta({ defaultCladdingHeightM: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div className="form-row">
          <label>פחת ריצוף ברירת מחדל (%)</label>
          <input
            type="number"
            step="1"
            min="0"
            max="100"
            value={project.defaultTilingWastePercent}
            onChange={(e) => updateProjectMeta({ defaultTilingWastePercent: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div className="form-row">
          <label>פחת חיפוי ברירת מחדל (%)</label>
          <input
            type="number"
            step="1"
            min="0"
            max="100"
            value={project.defaultCladdingWastePercent}
            onChange={(e) => updateProjectMeta({ defaultCladdingWastePercent: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div className="form-row">
          <label>פחת פנלים ברירת מחדל (%)</label>
          <input
            type="number"
            step="1"
            min="0"
            max="100"
            value={project.defaultPanelsWastePercent}
            onChange={(e) => updateProjectMeta({ defaultPanelsWastePercent: parseFloat(e.target.value) || 0 })}
          />
        </div>
      </TopBarMenu>
    </div>
  );
}
