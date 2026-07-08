import { useCompareStore } from '../../store/compareStore';
import ViewModeSwitch from './ViewModeSwitch';

export default function CompareTopBar({ onExport, exporting }: { onExport: () => void; exporting: boolean }) {
  const comparison = useCompareStore((s) => s.comparison);
  const setComparison = useCompareStore((s) => s.setComparison);
  const updateComparisonMeta = useCompareStore((s) => s.updateComparisonMeta);
  const persist = useCompareStore((s) => s.persist);

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
      <button className="btn-primary small" onClick={onExport} disabled={exporting}>
        {exporting ? 'מייצא…' : '⬇ ייצוא PDF'}
      </button>
    </div>
  );
}
