import { useState } from 'react';
import { useCompareStore } from '../../store/compareStore';
import TopBarMenu, { type MenuId } from '../TopBarMenu';
import ViewModeSwitch from './ViewModeSwitch';

export default function CompareTopBar({ onExport, exporting }: { onExport: () => void; exporting: boolean }) {
  const comparison = useCompareStore((s) => s.comparison);
  const setComparison = useCompareStore((s) => s.setComparison);
  const updateComparisonMeta = useCompareStore((s) => s.updateComparisonMeta);
  const persist = useCompareStore((s) => s.persist);
  const toolMode = useCompareStore((s) => s.toolMode);
  const setToolMode = useCompareStore((s) => s.setToolMode);
  const exportRegion = useCompareStore((s) => s.exportRegion);
  const setExportRegion = useCompareStore((s) => s.setExportRegion);
  const annotationsVisible = useCompareStore((s) => s.annotationsVisible);
  const toggleAnnotationsVisible = useCompareStore((s) => s.toggleAnnotationsVisible);
  const measurementsVisible = useCompareStore((s) => s.measurementsVisible);
  const toggleMeasurementsVisible = useCompareStore((s) => s.toggleMeasurementsVisible);
  const canUndo = useCompareStore((s) => s.history.length > 0);
  const canRedo = useCompareStore((s) => s.future.length > 0);
  const undo = useCompareStore((s) => s.undo);
  const redo = useCompareStore((s) => s.redo);
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);

  if (!comparison) return null;

  const close = async () => {
    await persist();
    setComparison(null);
  };

  const handleExport = () => {
    setOpenMenu(null);
    onExport();
  };

  return (
    <div className="top-bar">
      <div className="app-brand">
        <span className="app-brand-name">BetterCalc</span>
        <span className="app-brand-divider">|</span>
        <span className="app-brand-mode">השוואת תכניות</span>
      </div>
      <input
        className="project-name-input"
        value={comparison.name}
        onChange={(e) => updateComparisonMeta({ name: e.target.value })}
      />
      <input
        className="project-name-input apt-input"
        value={comparison.apartmentNumber}
        onChange={(e) => updateComparisonMeta({ apartmentNumber: e.target.value })}
        placeholder="מספר דירה"
      />

      <ViewModeSwitch />

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
          סימוני שינויים
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
        label={exporting ? '⬇ מייצא…' : '⬇ ייצוא PDF'}
        title="ייצוא ההשוואה ל-PDF"
        highlighted={!!exportRegion}
      >
        <button className="menu-item" onClick={handleExport} disabled={exporting}>
          <span className="menu-check">📄</span>
          {exportRegion ? 'ייצוא האזור שנבחר' : 'ייצוא התוכנית המלאה'}
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
          <button className="menu-item" onClick={() => setExportRegion(null)}>
            <span className="menu-check">✕</span>
            ביטול האזור שנבחר
          </button>
        )}
        <p className="menu-hint">
          {exportRegion ? 'הייצוא ייחתך לאזור שסימנת על התוכנית.' : 'ללא אזור נבחר — מיוצאת התוכנית המלאה.'}
        </p>
      </TopBarMenu>

      {/* Leaving the comparison lives at the far end of the bar, matching the takeoff top bar. */}
      <button className="btn-secondary small" onClick={close}>
        → השוואות
      </button>
    </div>
  );
}
