import { useCompareStore } from '../../store/compareStore';
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
  const canUndo = useCompareStore((s) => s.history.length > 0);
  const canRedo = useCompareStore((s) => s.future.length > 0);
  const undo = useCompareStore((s) => s.undo);
  const redo = useCompareStore((s) => s.redo);

  if (!comparison) return null;

  const close = async () => {
    await persist();
    setComparison(null);
  };

  return (
    <div className="top-bar">
      <button className="btn-secondary small" onClick={close}>
        ← השוואות
      </button>
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
      <div className="undo-redo-group">
        <button className="btn-secondary small" onClick={undo} disabled={!canUndo} title="בטל פעולה (Ctrl+Z)">
          ↶
        </button>
        <button className="btn-secondary small" onClick={redo} disabled={!canRedo} title="בצע שוב (Ctrl+Shift+Z)">
          ↷
        </button>
      </div>
      <button
        className={`btn-secondary small ${!annotationsVisible ? 'active' : ''}`}
        onClick={toggleAnnotationsVisible}
        title="הצג/הסתר סימונים ומדידות על גבי התוכנית"
      >
        {annotationsVisible ? '👁 הסתר סימונים' : '🚫 הצג סימונים'}
      </button>
      <button
        className={`btn-secondary small ${toolMode === 'export-region' ? 'active' : ''}`}
        onClick={() => setToolMode(toolMode === 'export-region' ? 'select' : 'export-region')}
        title="גרור על התוכנית כדי לבחור חלון ספציפי לייצוא"
      >
        ✂ {exportRegion ? 'שנה אזור ייצוא' : 'בחר אזור לייצוא'}
      </button>
      {exportRegion && (
        <button className="btn-secondary small" onClick={() => setExportRegion(null)} title="חזרה לייצוא כל העמוד">
          ✕ אזור
        </button>
      )}
      <button className="btn-primary small" onClick={onExport} disabled={exporting}>
        {exporting ? 'מייצא…' : '⬇ ייצוא PDF'}
      </button>
    </div>
  );
}
