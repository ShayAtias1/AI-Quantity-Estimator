import type { AreaKind, Measurement } from '../types/compare';

/**
 * Demolition / new-construction items in Revision Compare are ordinary area `Measurement`s
 * carrying an `areaKind` — there is no separate persisted entity. This module is the one place
 * that decides what counts as a change item, how its quantities are summed and how it is numbered,
 * so the Changes panel, the sidebar and the exported PDF table cannot disagree.
 */

export const CHANGE_KINDS: AreaKind[] = ['demolition', 'construction'];

/**
 * The minimum a change item has to look like to be counted. Structural, so the PDF table builder —
 * which is shared with the takeoff side and has its own measurement type — can sum through exactly
 * the same code as the Changes panel.
 */
export interface ChangeMeasurementLike {
  tool: string;
  areaKind?: AreaKind;
  areaM2?: number;
  calcMode?: 'footprint' | 'wall';
  wallLengthM?: number;
}

/** A measurement is a change item when it is a classified area with a computed square-meter value. */
export function isChangeMeasurement(m: ChangeMeasurementLike): boolean {
  return m.tool === 'area' && !!m.areaKind && typeof m.areaM2 === 'number';
}

/** Change items of one revision, in creation order, optionally limited to one source page. */
export function changeMeasurements(measurements: Measurement[], pageNumber?: number): Measurement[] {
  return measurements.filter((m) => isChangeMeasurement(m) && (pageNumber === undefined || m.pageNumber === pageNumber));
}

export interface ChangeTotals {
  count: number;
  /** Running metres — only wall-mode items genuinely have a traced length. */
  lengthM: number;
  areaM2: number;
}

export function changeTotals<T extends ChangeMeasurementLike>(measurements: T[], kind: AreaKind): ChangeTotals {
  let count = 0;
  let lengthM = 0;
  let areaM2 = 0;
  for (const m of measurements) {
    if (!isChangeMeasurement(m) || m.areaKind !== kind) continue;
    count += 1;
    areaM2 += m.areaM2 ?? 0;
    // A footprint area has no linear quantity: never fold it into the running-metre total.
    if (m.calcMode === 'wall' && typeof m.wallLengthM === 'number') lengthM += m.wallLengthM;
  }
  return { count, lengthM, areaM2 };
}

/**
 * The number shown on the plan, in the Changes table and in the exported report.
 *
 * The rule: one chronological sequence over every classified change item in the revision, across
 * all its pages — demolition and new construction share it, so the kind has no influence on the
 * number. Creation order is the revision's own `measurements` array, which is append-only, so the
 * order is reliable without adding a timestamp to the model.
 *
 * It is deliberately page- and filter-independent: switching page, or listing only one page, never
 * renumbers anything, and a new item always takes the next number. Callers must pass the
 * revision's **whole** measurement list, not a page slice.
 */
export function changeNumbering(revisionMeasurements: Measurement[]): Map<string, number> {
  const map = new Map<string, number>();
  let n = 0;
  for (const m of revisionMeasurements) {
    if (!isChangeMeasurement(m)) continue;
    n += 1;
    map.set(m.id, n);
  }
  return map;
}
