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
}

/** Placeholder for future automatic change detection (out of scope for now). */
export interface DetectedChange {
  id: string;
  kind: 'line-added' | 'line-removed' | 'dimension-changed' | 'area-changed';
  points: Point[];
  description: string;
}

export interface ComparisonPage {
  originalPageNumber: number;
  revisedPageNumber: number;
  originalCalibration: Calibration | null;
  revisedCalibration: Calibration | null;
  alignment: LayerTransform;
  alignmentPoints: AlignmentPointPair[];
}

export interface Comparison {
  id: string;
  name: string;
  apartmentNumber: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
  originalFileName: string;
  revisedFileName: string;
  originalOpacity: number;
  revisedOpacity: number;
  originalVisible: boolean;
  revisedVisible: boolean;
  originalColorTint: string;
  revisedColorTint: string;
  /** When true, render this layer with the PDF's own colors instead of the flat tint. */
  originalUseSourceColors: boolean;
  revisedUseSourceColors: boolean;
  pages: Record<number, ComparisonPage>;
  markups: Markup[];
  measurements: Measurement[];
  autoDetectedChanges?: DetectedChange[];
}
