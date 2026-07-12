// Core domain types for the quantity-takeoff app.

export type TilingCategory = 'regular' | 'as';

export const TILING_CATEGORY_LABELS: Record<TilingCategory, string> = {
  regular: 'ריצוף רגיל',
  as: 'ריצוף AS',
};

/** Addable work item types — the "+" buttons in the room panel. */
export type WorkType = 'tiling' | 'cladding' | 'panels';

export const WORK_TYPE_LABELS: Record<WorkType, string> = {
  tiling: 'ריצוף',
  cladding: 'חיפוי קירות',
  panels: 'פנלים',
};

export const WORK_TYPE_UNITS: Record<WorkType, string> = {
  tiling: 'מ"ר',
  cladding: 'מ"ר',
  panels: 'מ"ר',
};

/** The 4 categories shown in quantity reports/totals (tiling is split by category). */
export type ReportCategory = 'tiling_regular' | 'tiling_as' | 'cladding' | 'panels';

export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  tiling_regular: 'ריצוף רגיל',
  tiling_as: 'ריצוף AS',
  cladding: 'חיפוי קירות',
  panels: 'פנלים',
};

/** Panels (skirting) are a strip running along the room perimeter, this height (meters) tall. */
export const PANEL_HEIGHT_M = 0.1;

export interface WorkItem {
  id: string;
  type: WorkType;
  /** Only relevant for type 'tiling' — regular or AS (wet-area) tiling. Defaults to 'regular' if unset. */
  tilingCategory?: TilingCategory;
  /** Only relevant for type 'cladding' — height in meters used to multiply perimeter. */
  heightM?: number;
  /** Waste percentage override (0-100). If undefined, the project's per-type default is used. */
  wastePercent?: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Room {
  id: string;
  pageNumber: number;
  /** Polygon vertices in PDF page coordinates (unscaled, at pdf.js scale=1). */
  points: Point[];
  closed: boolean;
  name: string;
  apartmentNumber: string;
  notes: string;
  workItems: WorkItem[];
  color: string;
  /** Set when the room came from auto-detection: the matched room-type profile key (see roomDetection). */
  detectedType?: string;
  /** Auto-detection confidence: 'high' when a name was recognized, 'low' when it needs manual review. */
  detectionConfidence?: 'high' | 'low';
}

export interface Calibration {
  /** Distance in px (page coordinates at scale=1) between the two calibration points. */
  pixelDistance: number;
  /** Real-world distance in meters entered by the user. */
  realDistanceMeters: number;
  /** meters per pixel, derived: realDistanceMeters / pixelDistance */
  metersPerPixel: number;
}

export interface PageData {
  pageNumber: number;
  calibration: Calibration | null;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Stored PDF file as a Blob in IndexedDB. */
  pdfFileName: string;
  pages: Record<number, PageData>;
  rooms: Room[];
  measurements: Measurement[];
  defaultCladdingHeightM: number;
  defaultTilingWastePercent: number;
  defaultCladdingWastePercent: number;
  defaultPanelsWastePercent: number;
}

export type ToolMode = 'select' | 'pan' | 'calibrate' | 'draw' | 'draw-rect' | 'measure';

export type MeasureTool = 'distance' | 'area' | 'perimeter';

export const MEASURE_TOOL_LABELS: Record<MeasureTool, string> = {
  distance: 'מרחק',
  area: 'שטח',
  perimeter: 'היקף',
};

/** How the user draws an area measurement: click a closed polygon, or drag a rectangle's two opposite corners. */
export type AreaShape = 'polygon' | 'rectangle';

export interface Measurement {
  id: string;
  pageNumber: number;
  tool: MeasureTool;
  points: Point[];
  /** Computed display value, cached at creation time (e.g. "3.24 מ'" or "12.5 מ\"ר"). */
  label: string;
}

/** One row per room, matching the contractor-facing quantities report layout. */
export interface RoomQuantitySummary {
  roomId: string;
  apartmentNumber: string;
  roomName: string;
  tilingRegularAreaM2: number | null;
  tilingAsAreaM2: number | null;
  claddingAreaM2: number | null;
  panelsAreaM2: number | null;
  tilingRegularWastePercent: number | null;
  tilingAsWastePercent: number | null;
  claddingWastePercent: number | null;
  panelsWastePercent: number | null;
  tilingRegularOrderM2: number | null;
  tilingAsOrderM2: number | null;
  claddingOrderM2: number | null;
  panelsOrderM2: number | null;
  notes: string;
}

export interface ReportCategoryTotal {
  category: ReportCategory;
  quantityM2: number;
  wastePercent: number;
  orderM2: number;
}
