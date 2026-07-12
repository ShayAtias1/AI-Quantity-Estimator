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

export function roomMetrics(room: Room, calibration: Calibration | null) {
  const mpp = calibration?.metersPerPixel ?? 0;
  const areaM2 = mpp ? polygonAreaM2(room.points, mpp) : 0;
  const perimeterM = mpp ? polygonPerimeterM(room.points, room.closed, mpp) : 0;
  return { areaM2, perimeterM };
}

/** Raw (pre-waste) quantity in m² for a work item. */
export function itemQuantityM2(item: WorkItem, areaM2: number, perimeterM: number, defaultCladdingHeightM: number): number {
  switch (item.type) {
    case 'tiling':
      return areaM2;
    case 'cladding':
      return perimeterM * (item.heightM ?? defaultCladdingHeightM);
    case 'panels':
      return perimeterM * PANEL_HEIGHT_M;
    default:
      return 0;
  }
}

function defaultWasteFor(item: WorkItem, project: Project): number {
  switch (item.type) {
    case 'tiling':
      return project.defaultTilingWastePercent;
    case 'cladding':
      return project.defaultCladdingWastePercent;
    case 'panels':
      return project.defaultPanelsWastePercent;
    default:
      return 0;
  }
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
    const { areaM2, perimeterM } = roomMetrics(room, calibration);

    const buckets: Record<ReportCategory, Bucket> = {
      tiling_regular: emptyBucket(),
      tiling_as: emptyBucket(),
      cladding: emptyBucket(),
      panels: emptyBucket(),
    };

    for (const item of room.workItems) {
      const qty = itemQuantityM2(item, areaM2, perimeterM, project.defaultCladdingHeightM);
      const waste = item.wastePercent ?? defaultWasteFor(item, project);
      const category: ReportCategory =
        item.type === 'tiling' ? (item.tilingCategory === 'as' ? 'tiling_as' : 'tiling_regular') : item.type;
      const bucket = buckets[category];
      bucket.areaM2 += qty;
      bucket.orderM2 += qty * (1 + waste / 100);
      if (bucket.wastePercent == null) bucket.wastePercent = waste;
    }

    const toArea = (b: Bucket) => (b.wastePercent == null ? null : round(b.areaM2, 2));
    const toWaste = (b: Bucket) => b.wastePercent;
    const toOrder = (b: Bucket) => (b.wastePercent == null ? null : round(b.orderM2, 2));

    return {
      roomId: room.id,
      apartmentNumber: room.apartmentNumber,
      roomName: room.name,
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

  for (const s of summaries) {
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
    tiling_as: project.defaultTilingWastePercent,
    cladding: project.defaultCladdingWastePercent,
    panels: project.defaultPanelsWastePercent,
  };

  return (Object.keys(totals) as ReportCategory[]).map((category) => ({
    category,
    quantityM2: round(totals[category].quantityM2, 2),
    wastePercent: defaultWaste[category],
    orderM2: round(totals[category].orderM2, 2),
  }));
}

export { WORK_TYPE_LABELS, WORK_TYPE_UNITS, REPORT_CATEGORY_LABELS };
