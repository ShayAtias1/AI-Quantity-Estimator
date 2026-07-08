import { useCompareStore } from '../../store/compareStore';
import { IDENTITY_TRANSFORM } from '../../types/compare';

export default function AlignmentTools() {
  const comparison = useCompareStore((s) => s.comparison);
  const currentPageKey = useCompareStore((s) => s.currentPageKey);
  const toolMode = useCompareStore((s) => s.toolMode);
  const setToolMode = useCompareStore((s) => s.setToolMode);
  const setAlignmentTransform = useCompareStore((s) => s.setAlignmentTransform);
  const beginAlignmentPointPick = useCompareStore((s) => s.beginAlignmentPointPick);
  const clearAlignmentPoints = useCompareStore((s) => s.clearAlignmentPoints);
  const pickingAlignmentPoints = useCompareStore((s) => s.pickingAlignmentPoints);
  const alignmentPendingOriginal = useCompareStore((s) => s.alignmentPendingOriginal);

  if (!comparison) return null;
  const alignment = comparison.pages[currentPageKey]?.alignment ?? IDENTITY_TRANSFORM;

  return (
    <div className="alignment-tools">
      <h4>יישור תוכניות</h4>

      <button className={`btn-secondary small full-width ${toolMode === 'align' && !pickingAlignmentPoints ? 'active' : ''}`} onClick={() => setToolMode('align')}>
        ✋ גרור להזזת התוכנית המעודכנת
      </button>

      <div className="form-row inline">
        <label>סיבוב (מעלות)</label>
        <input
          type="range"
          min={-180}
          max={180}
          step={0.5}
          value={alignment.rotationDeg}
          onChange={(e) => setAlignmentTransform(currentPageKey, { ...alignment, rotationDeg: parseFloat(e.target.value) })}
        />
        <span className="alignment-value">{alignment.rotationDeg.toFixed(1)}°</span>
      </div>

      <div className="form-row inline">
        <label>קנה מידה יחסי</label>
        <input
          type="range"
          min={0.5}
          max={2}
          step={0.01}
          value={alignment.scale}
          onChange={(e) => setAlignmentTransform(currentPageKey, { ...alignment, scale: parseFloat(e.target.value) })}
        />
        <span className="alignment-value">{alignment.scale.toFixed(2)}×</span>
      </div>

      <button className={`btn-secondary small full-width ${pickingAlignmentPoints ? 'active' : ''}`} onClick={beginAlignmentPointPick}>
        🎯 סמן נקודות התאמה
      </button>
      {pickingAlignmentPoints && (
        <p className="alignment-hint">
          {alignmentPendingOriginal
            ? 'עכשיו לחץ על אותה נקודה בתוכנית המעודכנת (האדומה)'
            : 'לחץ על נקודת ייחוס בתוכנית המקור (האפורה) — פינת בניין, עמוד וכו׳. תצטרך לסמן 2 זוגות נקודות.'}
        </p>
      )}

      <button className="btn-secondary small full-width" onClick={() => clearAlignmentPoints(currentPageKey)}>
        איפוס יישור
      </button>
    </div>
  );
}
