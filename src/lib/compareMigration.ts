import type { Comparison, ComparisonPage } from '../types/compare';
import { IDENTITY_TRANSFORM } from '../types/compare';
import { isIdentityAlignment } from './compareScale';

/**
 * Brings a saved comparison up to the page-ownership model, in memory.
 *
 * Markups and measurements used to be shared by every page of a comparison: they had no page of
 * their own and were drawn on whatever page was open. They now belong to the source page they were
 * created on. Compare only ever opened on page 1 until page navigation was added, and page-less
 * geometry is in page-1 coordinates, so page 1 is where it belongs.
 *
 * The same pass normalizes calibrations, which now record the coordinate space they were measured
 * in. A source calibration was always in source px. A revised-layer calibration was measured in
 * source-display space at whatever alignment was in effect — identical to a revised-space value
 * only while the alignment scale is 1, so only those are converted; the rest are left unmarked and
 * `resolveCompareScale` reports them as ambiguous instead of guessing. Alignment records get the
 * method that produced them, inferred from what they hold.
 *
 * Idempotent: `changed` is false once there is nothing left to convert, and the caller only writes
 * back when it is true.
 */
export function migrateComparePageOwnership(raw: Comparison): { comparison: Comparison; changed: boolean } {
  let changed = false;

  const revisions = raw.revisions.map((r) => {
    const markups = (r.markups ?? []).map((m) => {
      if (typeof m.pageNumber === 'number') return m;
      changed = true;
      return { ...m, pageNumber: 1 };
    });
    const measurements = (r.measurements ?? []).map((m) => {
      if (typeof m.pageNumber === 'number') return m;
      changed = true;
      return { ...m, pageNumber: 1 };
    });
    return { ...r, markups, measurements };
  });

  const pages: Record<number, ComparisonPage> = {};
  for (const [key, page] of Object.entries(raw.pages ?? {})) {
    let originalCalibration = page.originalCalibration;
    if (originalCalibration && !originalCalibration.space) {
      originalCalibration = { ...originalCalibration, space: 'original' };
      changed = true;
    }
    const revisionData: ComparisonPage['revisions'] = {};
    for (const [revisionId, rp] of Object.entries(page.revisions ?? {})) {
      let next = rp;
      const alignment = rp.alignment ?? IDENTITY_TRANSFORM;
      if (rp.revisedCalibration && !rp.revisedCalibration.space && alignment.scale === 1) {
        next = { ...next, revisedCalibration: { ...rp.revisedCalibration, space: 'revised' } };
        changed = true;
      }
      if (!next.alignmentMethod) {
        const method =
          (rp.alignmentPoints?.length ?? 0) === 2 ? 'points' : isIdentityAlignment(alignment) ? undefined : 'manual';
        if (method) {
          next = { ...next, alignmentMethod: method };
          changed = true;
        }
      }
      revisionData[revisionId] = next;
    }
    pages[Number(key)] = { ...page, originalCalibration, revisions: revisionData };
  }

  if (!changed) return { comparison: raw, changed: false };
  return { comparison: { ...raw, revisions, pages }, changed: true };
}
