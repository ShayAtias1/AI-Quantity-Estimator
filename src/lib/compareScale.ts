import type { ComparisonPage, LayerTransform, RevisionPageData } from '../types/compare';
import { IDENTITY_TRANSFORM } from '../types/compare';

/**
 * Which calibration the real-world scale of a comparison page is derived from.
 * 'original' — the source plan was calibrated; 'revised' — only the active revision was.
 */
export type ScaleSource = 'original' | 'revised';

export type ScaleState =
  | 'calibrated'
  /** No calibration at all on this page for this revision. */
  | 'uncalibrated'
  /**
   * A revised-layer calibration saved before calibrations recorded which coordinate space they
   * were measured in, on a page whose alignment scale is not 1. Its value cannot be interpreted
   * safely either way, so it is reported rather than silently used.
   */
  | 'ambiguous';

export interface ResolvedScale {
  state: ScaleState;
  /**
   * Meters per pixel **of the source page's native px**, which is the space every measurement,
   * markup and calibration point on the comparison canvas is stored in. 0 unless `state` is
   * 'calibrated' — callers must not produce quantities from a zero.
   */
  metersPerPixel: number;
  source: ScaleSource | null;
  /** The alignment scale the conversion used (1 when the source calibration is used). */
  alignmentScale: number;
}

const UNCALIBRATED: ResolvedScale = { state: 'uncalibrated', metersPerPixel: 0, source: null, alignmentScale: 1 };

/**
 * The one scale rule for Revision Compare.
 *
 * Everything the user clicks on the comparison canvas lands in the **source page's** native px
 * space — the overlay svg's viewBox is the source page, and the revised layer is only *displayed*
 * through `alignment`. So a quantity is always `lengthInSourcePx × metersPerSourcePixel`.
 *
 * - Source calibrated → its metersPerPixel is already per source px. The alignment scale is
 *   irrelevant, which is why a correctly aligned revised layer measures correctly too.
 * - Only the revised layer calibrated → its calibration is stored in the **revised PDF's own**
 *   native px (`space: 'revised'`), which is alignment-independent. Since `applyAlignment` is a
 *   similarity transform, one revised px spans `alignment.scale` source px, so
 *   `metersPerSourcePixel = metersPerRevisedPixel / alignment.scale`. Re-aligning the layer
 *   therefore changes the scale used, instead of silently invalidating the calibration.
 */
export function resolveCompareScale(
  page: ComparisonPage | undefined,
  revisionPage: RevisionPageData | undefined
): ResolvedScale {
  const original = page?.originalCalibration;
  if (original && original.metersPerPixel > 0) {
    return { state: 'calibrated', metersPerPixel: original.metersPerPixel, source: 'original', alignmentScale: 1 };
  }

  const revised = revisionPage?.revisedCalibration;
  if (revised && revised.metersPerPixel > 0) {
    const alignment: LayerTransform = revisionPage?.alignment ?? IDENTITY_TRANSFORM;
    const scale = alignment.scale;
    if (!(scale > 0)) return UNCALIBRATED;
    // Legacy value: measured in source-display space at an alignment we no longer know. Identical
    // to a revised-space value only while the alignment scale is 1 (the migration converts those);
    // anything else is genuinely unknown.
    if (revised.space !== 'revised') {
      if (scale === 1) {
        return { state: 'calibrated', metersPerPixel: revised.metersPerPixel, source: 'revised', alignmentScale: 1 };
      }
      return { state: 'ambiguous', metersPerPixel: 0, source: 'revised', alignmentScale: scale };
    }
    return { state: 'calibrated', metersPerPixel: revised.metersPerPixel / scale, source: 'revised', alignmentScale: scale };
  }

  return UNCALIBRATED;
}

export type AlignmentStatus = 'identity' | 'manual' | 'points';

/**
 * How the current source-page/revision pair got its alignment. `alignmentMethod` is authoritative
 * when present; older data is classified from what it holds — two saved reference-point pairs, or
 * any transform that is no longer the identity.
 */
export function resolveAlignmentStatus(revisionPage: RevisionPageData | undefined): AlignmentStatus {
  if (!revisionPage) return 'identity';
  if (revisionPage.alignmentMethod === 'points') return 'points';
  if (revisionPage.alignmentMethod === 'manual') return 'manual';
  if ((revisionPage.alignmentPoints?.length ?? 0) === 2) return 'points';
  return isIdentityAlignment(revisionPage.alignment) ? 'identity' : 'manual';
}

export function isIdentityAlignment(t: LayerTransform | undefined): boolean {
  if (!t) return true;
  return t.offsetX === 0 && t.offsetY === 0 && t.rotationDeg === 0 && t.scale === 1;
}
