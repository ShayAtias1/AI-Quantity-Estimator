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
  markups: Markup[];
  defaultCladdingHeightM: number;
  defaultTilingWastePercent: number;
  defaultCladdingWastePercent: number;
  defaultPanelsWastePercent: number;
  /** Customizable per project; defaults to DEFAULT_AREA_KIND_COLORS. */
  areaKindColors: Record<AreaKind, string>;
  /** Default wall height (meters) used to seed new 'wall' calc-mode area measurements; editable per-measurement afterward. */
  wallHeightDefaultM: number;
}

export type ToolMode = 'select' | 'pan' | 'calibrate' | 'draw' | 'draw-rect' | 'measure' | 'export-region' | 'markup';

export type MarkupTool = 'cloud' | 'arrow' | 'rectangle' | 'text' | 'dimension' | 'mask';

export const MARKUP_TOOL_LABELS: Record<MarkupTool, string> = {
  cloud: 'ענן סימון',
  arrow: 'חץ',
  rectangle: 'מלבן סימון',
  text: 'הערת טקסט',
  dimension: 'קו מידה',
  mask: 'הסתרה',
};

export interface Markup {
  id: string;
  pageNumber: number;
  tool: MarkupTool;
  /**
   * Interpretation depends on tool: 2 points for arrow/rectangle, polyline for cloud, 1 point for text.
   * A dimension holds 2 points for a single measure, or 3+ colinear points for a continued chain
   * (AutoCAD DIMCONTINUE style) — each consecutive pair is one measured segment.
   */
  points: Point[];
  /** For a dimension: the label of the whole run (the chain total when there are 3+ points). */
  text?: string;
  /** For a dimension chain: one label per segment, so `segmentTexts.length === points.length - 1`. */
  segmentTexts?: string[];
  /**
   * For a dimension: how far the dimension line was moved off the points it measures, in page px
   * along the run's normal. The points stay put; extension lines join them to the moved line.
   */
  offset?: number;
  /** Label size multiplier for text notes and dimension labels (1 = default). Absent means 1. */
  fontScale?: number;
  /** For tool === 'text': the note's rotation in degrees (0 = horizontal, -90 = reading bottom-to-top). */
  rotationDeg?: number;
  color: string;
  createdAt: number;
}

/** A page-native-coordinate rectangle marking the area of the plan to include in a PDF export, instead of the full page. */
export interface ExportRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type MeasureTool = 'distance' | 'area' | 'perimeter';

export const MEASURE_TOOL_LABELS: Record<MeasureTool, string> = {
  distance: 'מרחק',
  area: 'שטח',
  perimeter: 'היקף',
};

/** How the user draws an area measurement: click a closed polygon, or drag a rectangle's two opposite corners. */
export type AreaShape = 'polygon' | 'rectangle';

/** Area-measurement classification, used to tally demolition vs. new-construction quantities. */
export type AreaKind = 'demolition' | 'construction';

export const AREA_KIND_LABELS: Record<AreaKind, string> = {
  demolition: 'הריסה',
  construction: 'בנייה חדשה',
};

export const DEFAULT_AREA_KIND_COLORS: Record<AreaKind, string> = {
  demolition: '#eab308',
  construction: '#16a34a',
};

/**
 * How an area measurement's square-meter value is derived: 'footprint' is the drawn shape's own
 * area (the default); 'wall' is for a wall being demolished/built, where the plan only shows the
 * wall's run in 2D — the tool takes the longest edge of the drawn shape (the wall's length, not its
 * plan-view thickness) and multiplies it by a wall height (which can't be read off a 2D plan).
 */
export type AreaCalcMode = 'footprint' | 'wall';

export interface Measurement {
  id: string;
  pageNumber: number;
  tool: MeasureTool;
  points: Point[];
  /** Computed display value, cached at creation time (e.g. "3.24 מ'" or "12.5 מ\"ר"). */
  label: string;
  /** For tool === 'area': classifies the marked area for the demolition/construction summary. */
  areaKind?: AreaKind;
  /** For tool === 'area': raw computed square-meter value, kept alongside `label` so summaries don't need to re-parse it. */
  areaM2?: number;
  /** For tool === 'area': how areaM2 was derived. Defaults to 'footprint' when absent (measurements created before this field existed). */
  calcMode?: AreaCalcMode;
  /** For calcMode === 'wall': the longest-edge length in meters (areaM2 = wallLengthM * wallHeightM). */
  wallLengthM?: number;
  /** For calcMode === 'wall': the wall height used for this specific measurement — starts from the project's default, editable per-measurement. */
  wallHeightM?: number;
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
