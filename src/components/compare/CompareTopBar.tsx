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
