import type { Comparison, RevisionLayer } from '../types/compare';
import { changeMeasurements, changeNumbering } from './changeMeasurements';
import type { ChangeTable } from './exportComparePdf';

export type RevisionScope = 'active' | 'all';
export type PageScope = 'current' | 'all';

/** One source page compared against one revision — the unit a Compare export is made of. */
export interface ExportPair {
  /** Undefined only for a comparison that has no revision yet: its source pages still export. */
  revision: RevisionLayer | undefined;
  /** Source page key. The revised page actually rendered against it comes from the page mapping. */
  pageKey: number;
  /** What to call this pair when it has to be reported as skipped. */
  label: string;
}

/**
 * The pairs an export covers, in the order they are captured: revision-major, so a revision's
 * pages stay together in the finished document.
 */
export function planCompareExport(
  comparison: Comparison,
  opts: { revisionScope: RevisionScope; pageScope: PageScope; currentPageKey: number; originalNumPages: number }
): ExportPair[] {
  const revisions =
    opts.revisionScope === 'all'
      ? comparison.revisions
      : comparison.revisions.filter((r) => r.id === comparison.activeRevisionId);
  const targets: (RevisionLayer | undefined)[] = revisions.length > 0 ? revisions : [undefined];
  const pageKeys =
    opts.pageScope === 'all'
      ? Array.from({ length: Math.max(1, opts.originalNumPages) }, (_, i) => i + 1)
      : [opts.currentPageKey];

  const pairs: ExportPair[] = [];
  for (const revision of targets) {
    for (const pageKey of pageKeys) {
      pairs.push({ revision, pageKey, label: revision ? `${revision.label} — עמוד ${pageKey}` : `עמוד ${pageKey}` });
    }
  }
  return pairs;
}

/**
 * The revised page a source page is compared against for a given revision — the Phase A mapping,
 * defaulting to the same number when that pair has no record of its own.
 */
export function mappedRevisedPage(comparison: Comparison, revisionId: string, pageKey: number): number {
  return comparison.pages[pageKey]?.revisions[revisionId]?.revisedPageNumber ?? pageKey;
}

/**
 * The change table for one exported pair. Rows are only the changes belonging to that source page
 * and that revision; the numbering comes from the revision's whole measurement list, so the numbers
 * match the ones drawn on the plan.
 *
 * Deliberately independent of `measurementsVisible`: hiding the overlays is a viewing preference,
 * and must not quietly drop the quantities from the report.
 */
export function changeTableFor(comparisonName: string, revision: RevisionLayer | undefined, pageKey: number): ChangeTable {
  return {
    title: `${comparisonName} — ${revision?.label ?? 'מקור'} — עמוד ${pageKey}`,
    measurements: changeMeasurements(revision?.measurements ?? [], pageKey),
    numbering: changeNumbering(revision?.measurements ?? []),
  };
}
