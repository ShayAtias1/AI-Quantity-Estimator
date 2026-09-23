import type {
  Calibration,
  Project,
  ReportCategory,
  ReportCategoryTotal,
  Room,
  RoomQuantitySummary,
  WorkItem,
} from '../types';
import { PANEL_HEIGHT_M, REPORT_CATEGORY_LABELS, WORK_TYPE_LABELS, WORK_TYPE_UNITS } from '../types';
import { polygonAreaM2, polygonPerimeterM, round } from './geometry';

/**
 * Whether a page carries a usable scale. Matches exactly what `roomMetrics` treats as usable, so
 * "the UI says uncalibrated" and "the numbers come out 0" can never disagree.
 * Display-only: no stored data or computed quantity changes based on this.
 */
export function isPageCalibrated(project: Project, pageNumber: number): boolean {
  return (project.pages[pageNumber]?.calibration?.metersPerPixel ?? 0) > 0;
}

/**
 * Guards every numeric input that reaches a quantity. A cleared number field yields NaN, which
 * `??` does not catch — without this, one empty input turns areas, order quantities and the whole
 * report into NaN, and the bad value is persisted.
 */
function finiteOr(value: number | undefined | null, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function roomMetrics(room: Room, calibration: Calibration | null) {
  const mpp = calibration?.metersPerPixel ?? 0;
  const areaM2 = mpp ? polygonAreaM2(room.points, mpp) : 0;
  const perimeterM = mpp ? polygonPerimeterM(room.points, room.closed, mpp) : 0;
  return { areaM2, perimeterM };
}

/**
 * Panel height for one item: its own override, else the project default, else the historical 0.1 m
 * (projects saved before `defaultPanelHeightM` existed).
 */
export function effectivePanelHeightM(item: WorkItem, project: Project): number {
  return finiteOr(item.heightM, finiteOr(project.defaultPanelHeightM, PANEL_HEIGHT_M));
}

/** Project default waste % for AS tiling — falls back to the regular tiling default on older projects. */
export function effectiveTilingAsWastePercent(project: Project): number {
  return finiteOr(project.defaultTilingAsWastePercent, finiteOr(project.defaultTilingWastePercent, 0));
}

/**
 * Linear metres of a work item, where that is a meaningful second quantity. Panels (skirting) are
 * bought by the running metre and priced by area, so both numbers matter: the length is the room's
 * perimeter, and the m² quantity below is that length times the panel height.
 * Returns null for work types that have no linear reading.
 */
export function itemLengthM(item: WorkItem, perimeterM: number): number | null {
  return item.type === 'panels' ? perimeterM : null;
}

/** Raw (pre-waste) quantity in m² for a work item. */
export function itemQuantityM2(item: WorkItem, areaM2: number, perimeterM: number, project: Project): number {
  switch (item.type) {
    case 'tiling':
      return areaM2;
    case 'cladding':
      return perimeterM * finiteOr(item.heightM, finiteOr(project.defaultCladdingHeightM, 0));
    case 'panels':
      return perimeterM * effectivePanelHeightM(item, project);
    default:
      return 0;
  }
}

/**
 * Project-level default waste % for an item — the single source of truth for every caller
 * (room detail, report table, Excel and PDF exports all go through here or through the summaries
 * built with it), so regular and AS tiling never diverge by accident.
 */
export function defaultWasteFor(item: WorkItem, project: Project): number {
  switch (item.type) {
    case 'tiling':
      return item.tilingCategory === 'as'
        ? effectiveTilingAsWastePercent(project)
        : finiteOr(project.defaultTilingWastePercent, 0);
    case 'cladding':
      return finiteOr(project.defaultCladdingWastePercent, 0);
    case 'panels':
      return finiteOr(project.defaultPanelsWastePercent, 0);
    default:
      return 0;
  }
}

/**
 * Waste % actually applied to an item: its own override when that is a usable number, otherwise the
 * project default. The single place this decision is made — room detail, report table and exports
 * all go through here or through the summaries built with it.
 */
export function effectiveWastePercent(item: WorkItem, project: Project): number {
  return finiteOr(item.wastePercent, defaultWasteFor(item, project));
}

interface Bucket {
  areaM2: number;
  wastePercent: number | null;
  orderM2: number;
}

function emptyBucket(): Bucket {
  return { areaM2: 0, wastePercent: null, orderM2: 0 };
}

/** Build one summary row per room, matching the contractor-facing quantities report layout. */
export function buildRoomSummaries(project: Project): RoomQuantitySummary[] {
  return project.rooms.map((room) => {
    const calibration = project.pages[room.pageNumber]?.calibration ?? null;
    const pageCalibrated = isPageCalibrated(project, room.pageNumber);
    const { areaM2, perimeterM } = roomMetrics(room, calibration);

    const buckets: Record<ReportCategory, Bucket> = {
      tiling_regular: emptyBucket(),
      tiling_as: emptyBucket(),
      cladding: emptyBucket(),
      panels: emptyBucket(),
    };

    // Panels are tallied in running metres as well as m² — same geometry, second reading, and the
    // same per-item waste applied to both. Summed per work item exactly like the areas below.
    let panelsLengthM = 0;
    let panelsOrderLengthM = 0;
    for (const item of room.workItems) {
      const qty = itemQuantityM2(item, areaM2, perimeterM, project);
      const waste = effectiveWastePercent(item, project);
      const lengthM = itemLengthM(item, perimeterM);
      if (lengthM != null) {
        panelsLengthM += lengthM;
        panelsOrderLengthM += lengthM * (1 + waste / 100);
      }
      const category: ReportCategory =
        item.type === 'tiling' ? (item.tilingCategory === 'as' ? 'tiling_as' : 'tiling_regular') : item.type;
      const bucket = buckets[category];
      bucket.areaM2 += qty;
      bucket.orderM2 += qty * (1 + waste / 100);
      if (bucket.wastePercent == null) bucket.wastePercent = waste;
    }

    // Without a scale every number here would be 0 — not a real quantity. They are reported as
    // null so that no consumer can print, sum or formulate them as if they were zero; the
    // `pageCalibrated` flag tells the exports to say why the cells are empty.
    const toArea = (b: Bucket) => (b.wastePercent == null || !pageCalibrated ? null : round(b.areaM2, 2));
    const toWaste = (b: Bucket) => (b.wastePercent == null ? null : b.wastePercent);
    const toOrder = (b: Bucket) => (b.wastePercent == null || !pageCalibrated ? null : round(b.orderM2, 2));

    return {
      roomId: room.id,
      apartmentNumber: room.apartmentNumber,
      roomName: room.name,
      pageCalibrated,
      panelsLengthM: buckets.panels.wastePercent == null || !pageCalibrated ? null : round(panelsLengthM, 2),
      panelsOrderLengthM: buckets.panels.wastePercent == null || !pageCalibrated ? null : round(panelsOrderLengthM, 2),
      tilingRegularAreaM2: toArea(buckets.tiling_regular),
      tilingAsAreaM2: toArea(buckets.tiling_as),
      claddingAreaM2: toArea(buckets.cladding),
      panelsAreaM2: toArea(buckets.panels),
      tilingRegularWastePercent: toWaste(buckets.tiling_regular),
      tilingAsWastePercent: toWaste(buckets.tiling_as),
      claddingWastePercent: toWaste(buckets.cladding),
      panelsWastePercent: toWaste(buckets.panels),
      tilingRegularOrderM2: toOrder(buckets.tiling_regular),
      tilingAsOrderM2: toOrder(buckets.tiling_as),
      claddingOrderM2: toOrder(buckets.cladding),
      panelsOrderM2: toOrder(buckets.panels),
      notes: room.notes,
    };
  });
}

/** Groups room summaries by apartment number, preserving first-seen order (matches the Excel export's blocks). */
export function groupSummariesByApartment(summaries: RoomQuantitySummary[]): { apartment: string; rooms: RoomQuantitySummary[] }[] {
  const groups = new Map<string, RoomQuantitySummary[]>();
  const order: string[] = [];
  for (const s of summaries) {
    const key = s.apartmentNumber || '';
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(s);
  }
  return order.map((key) => ({ apartment: key, rooms: groups.get(key)! }));
}

/** Totals across all rooms for the 4 report categories. */
export function buildReportCategoryTotals(project: Project, summaries: RoomQuantitySummary[]): ReportCategoryTotal[] {
  const totals: Record<ReportCategory, { quantityM2: number; orderM2: number }> = {
    tiling_regular: { quantityM2: 0, orderM2: 0 },
    tiling_as: { quantityM2: 0, orderM2: 0 },
    cladding: { quantityM2: 0, orderM2: 0 },
    panels: { quantityM2: 0, orderM2: 0 },
  };

  let panelsLengthM = 0;
  let panelsOrderLengthM = 0;
  for (const s of summaries) {
    panelsLengthM += s.panelsLengthM ?? 0;
    panelsOrderLengthM += s.panelsOrderLengthM ?? 0;
    if (s.tilingRegularAreaM2 != null) {
      totals.tiling_regular.quantityM2 += s.tilingRegularAreaM2;
      totals.tiling_regular.orderM2 += s.tilingRegularOrderM2 ?? 0;
    }
    if (s.tilingAsAreaM2 != null) {
      totals.tiling_as.quantityM2 += s.tilingAsAreaM2;
      totals.tiling_as.orderM2 += s.tilingAsOrderM2 ?? 0;
    }
    if (s.claddingAreaM2 != null) {
      totals.cladding.quantityM2 += s.claddingAreaM2;
      totals.cladding.orderM2 += s.claddingOrderM2 ?? 0;
    }
    if (s.panelsAreaM2 != null) {
      totals.panels.quantityM2 += s.panelsAreaM2;
      totals.panels.orderM2 += s.panelsOrderM2 ?? 0;
    }
  }

  const defaultWaste: Record<ReportCategory, number> = {
    tiling_regular: project.defaultTilingWastePercent,
    tiling_as: effectiveTilingAsWastePercent(project),
    cladding: project.defaultCladdingWastePercent,
    panels: project.defaultPanelsWastePercent,
  };

  return (Object.keys(totals) as ReportCategory[]).map((category) => ({
    category,
    quantityM2: round(totals[category].quantityM2, 2),
    wastePercent: defaultWaste[category],
    orderM2: round(totals[category].orderM2, 2),
    // Only panels carry a linear reading; the other categories have none.
    lengthM: category === 'panels' ? round(panelsLengthM, 2) : null,
    orderLengthM: category === 'panels' ? round(panelsOrderLengthM, 2) : null,
  }));
}

export { WORK_TYPE_LABELS, WORK_TYPE_UNITS, REPORT_CATEGORY_LABELS };
