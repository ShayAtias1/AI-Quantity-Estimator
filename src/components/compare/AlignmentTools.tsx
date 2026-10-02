import { alignmentStatusFor, useCompareStore } from '../../store/compareStore';
import { IDENTITY_TRANSFORM } from '../../types/compare';
import Icon from '../Icon';
import { useT } from '../../i18n';

/**
 * Bringing the revised layer onto the original. Three groups, in the order they are used: drag it
 * roughly into place, fine-tune rotation and relative scale, or let two reference-point pairs solve
 * all three at once. Reset is the way out.
 *
 * The alignment *state* is reported once, in the context strip above the tabs; this panel is the
 * controls only.
 */
export default function AlignmentTools() {
  const t = useT();
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
  const alignment = comparison.pages[currentPageKey]?.revisions[comparison.activeRevisionId]?.alignment ?? IDENTITY_TRANSFORM;
  const aligned = alignmentStatusFor(comparison, currentPageKey) !== 'identity';
  const hasRevision = comparison.revisions.length > 0;

  return (
    <div className="alignment-tools tool-group">
      <span className="section-label">{t('compare.alignment.title')}</span>

      <button
        className={`btn-secondary small full-width ${toolMode === 'align' && !pickingAlignmentPoints ? 'active' : ''}`}
        onClick={() => setToolMode(toolMode === 'align' ? 'select' : 'align')}
        disabled={!hasRevision}
        aria-pressed={toolMode === 'align' && !pickingAlignmentPoints}
      >
        <Icon name="move" />
        {t('compare.alignment.drag')}
      </button>

      <div className="form-row inline">
        <label>{t('compare.alignment.rotation')}</label>
        <input
          type="range"
          min={-180}
          max={180}
          step={0.5}
          value={alignment.rotationDeg}
          disabled={!hasRevision}
          onChange={(e) => setAlignmentTransform(currentPageKey, { ...alignment, rotationDeg: parseFloat(e.target.value) })}
        />
        <span className="alignment-value tnum">{alignment.rotationDeg.toFixed(1)}°</span>
      </div>

      <div className="form-row inline">
        <label>{t('compare.alignment.scale')}</label>
        <input
          type="range"
          min={0.5}
          max={2}
          step={0.01}
          value={alignment.scale}
          disabled={!hasRevision}
          onChange={(e) => setAlignmentTransform(currentPageKey, { ...alignment, scale: parseFloat(e.target.value) })}
        />
        <span className="alignment-value tnum">{alignment.scale.toFixed(2)}×</span>
      </div>

      {/* The accurate route: two matching points solve offset, rotation and scale together. */}
      <span className="section-label">{t('compare.alignment.byPoints')}</span>
      <button
        className={`${pickingAlignmentPoints ? 'btn-primary' : 'btn-secondary'} small full-width`}
        onClick={beginAlignmentPointPick}
        disabled={!hasRevision}
        aria-pressed={pickingAlignmentPoints}
      >
        <Icon name="target" />
        {pickingAlignmentPoints ? t('compare.alignment.picking') : t('compare.alignment.pickPairs')}
      </button>
      {pickingAlignmentPoints && (
        <p className="tool-hint">
          <Icon name="alert" size={13} />
          {alignmentPendingOriginal ? t('compare.alignment.pickRevised') : t('compare.alignment.pickOriginal')}
        </p>
      )}

      <button
        className="btn-ghost small full-width"
        onClick={() => clearAlignmentPoints(currentPageKey)}
        disabled={!hasRevision || !aligned}
        title={t('compare.alignment.resetHint')}
      >
        <Icon name="reset" />
        {t('compare.alignment.reset')}
      </button>
    </div>
  );
}
