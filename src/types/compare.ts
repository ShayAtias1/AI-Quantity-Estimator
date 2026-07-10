// Domain types for the Drawing Overlay & Revision Compare feature.
import type { Calibration, Point } from './index';

export type CompareLayer = 'original' | 'revised';

export type CompareToolMode = 'select' | 'pan' | 'calibrate' | 'measure' | 'markup' | 'align';

export type MarkupTool = 'cloud' | 'arrow' | 'rectangle' | 'text' | 'dimension';

export const MARKUP_TOOL_LABELS: Record<MarkupTool, string> = {
  cloud: 'ענן סימון',
  arrow: 'חץ',
  rectangle: 'מלבן סימון',
  text: 'הערת טקסט',
  dimension: 'קו מידה',
};

export type MeasureTool = 'distance' | 'area' | 'perimeter';

export const MEASURE_TOOL_LABELS: Record<MeasureTool, string> = {
  distance: 'מרחק',
  area: 'שטח',
  perimeter: 'היקף',
};

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

export type CompareViewMode = 'overlay' | 'swipe' | 'blink';

/** Transform applied to the revised layer on top of the shared viewport pan/zoom, expressed in the original layer's native px space. */
export interface LayerTransform {
  offsetX: number;
  offsetY: number;
  rotationDeg: number;
  scale: number;
}

export const IDENTITY_TRANSFORM: LayerTransform = { offsetX: 0, offsetY: 0, rotationDeg: 0, scale: 1 };

export interface AlignmentPointPair {
  originalPoint: Point;
  revisedPoint: Point;
}

export interface Markup {
  id: string;
  tool: MarkupTool;
  /** Interpretation depends on tool: 2 points for arrow/rectangle/dimension, polyline for cloud, 1 point for text. */
  points: Point[];
  text?: string;
  color: string;
  createdAt: number;
}

export interface Measurement {
  id: string;
  tool: MeasureTool;
  points: Point[];
  /** Computed display value, cached at creation time (e.g. "3.24 מ'" or "12.5 מ\"ר"). */
  label: string;
  /** For tool === 'area': classifies the marked area for the demolition/construction summary. */
  areaKind?: AreaKind;
  /** For tool === 'area': raw computed square-meter value, kept alongside `label` so summaries don't need to re-parse it. */
  areaM2?: number;
}

/** Placeholder for future automatic change detection (out of scope for now). */
export interface DetectedChange {
  id: string;
  kind: 'line-added' | 'line-removed' | 'dimension-changed' | 'area-changed';
  points: Point[];
  description: string;
}

/** One uploaded "revised" plan compared against the shared original. A comparison can hold several. */
export interface RevisionLayer {
  id: string;
  label: string;
  fileName: string;
  opacity: number;
  visible: boolean;
  colorTint: string;
  /** When true, render this layer with the PDF's own colors instead of the flat tint. */
  useSourceColors: boolean;
}

/** Per-page data for one revision: its own page mapping, calibration and alignment against the original. */
export interface RevisionPageData {
  revisedPageNumber: number;
  revisedCalibration: Calibration | null;
  alignment: LayerTransform;
  alignmentPoints: AlignmentPointPair[];
}

export interface ComparisonPage {
  originalPageNumber: number;
  originalCalibration: Calibration | null;
  /** Keyed by RevisionLayer.id. */
  revisions: Record<string, RevisionPageData>;
}

export interface Comparison {
  id: string;
  name: string;
  apartmentNumber: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
  originalFileName: string;
  originalOpacity: number;
  originalVisible: boolean;
  originalColorTint: string;
  originalUseSourceColors: boolean;
  pages: Record<number, ComparisonPage>;
  /** Uploaded revised plans, all compared against the same original. */
  revisions: RevisionLayer[];
  /** The revision currently shown/aligned/calibrated as the "revised" layer. */
  activeRevisionId: string;
  markups: Markup[];
  measurements: Measurement[];
  /** Customizable per comparison; defaults to DEFAULT_AREA_KIND_COLORS. */
  areaKindColors: Record<AreaKind, string>;
  autoDetectedChanges?: DetectedChange[];
}
