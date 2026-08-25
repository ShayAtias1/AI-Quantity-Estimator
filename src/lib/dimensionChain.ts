import type { Point } from '../types';
import { distancePx, pxToMeters } from './geometry';

/**
 * Labels for a dimension run: one per measured segment, plus the run total (which equals the
 * single segment's length when the dimension isn't a chain).
 *
 * Values are whole centimeters with no unit suffix, the way dimensions are written on the plans
 * themselves (e.g. "279", "384").
 */
export function dimensionLabels(points: Point[], metersPerPixel: number): { segmentTexts: string[]; text: string } {
  const lengths = points.slice(0, -1).map((a, i) => pxToMeters(distancePx(a, points[i + 1]), metersPerPixel));
  const cm = (meters: number) => `${Math.round(meters * 100)}`;
  return {
    segmentTexts: lengths.map(cm),
    text: cm(lengths.reduce((s, m) => s + m, 0)),
  };
}

/**
 * Geometry for drawing a dimension markup, whether it's a single measure (2 points) or a
 * continued chain (3+ colinear points, AutoCAD DIMCONTINUE style). Shared by the on-screen SVG
 * renderers (PdfViewer / CompareCanvas) and the canvas rasterizer used for PDF export, so all
 * three draw the same thing.
 *
 * All lengths are in the caller's coordinate space (page px on screen, scaled px on canvas).
 */
export interface DimensionChainGeometry {
  /** Short oblique "architectural tick" slash at every stop along the run. */
  ticks: { from: Point; to: Point }[];
  /** One entry per measured segment, in the same order as `segmentTexts`. */
  segments: { labelPos: Point }[];
  /**
   * The overall dimension of a chain: a second dimension line parallel to the run, offset outwards,
   * with its own end ticks, extension lines back to the run, and label. Null for a single measure.
   */
  total: {
    line: { from: Point; to: Point };
    ticks: { from: Point; to: Point }[];
    extensions: { from: Point; to: Point }[];
    labelPos: Point;
  } | null;
  /** Rotation (degrees) that makes label text run along the dimension line, kept upright. */
  angleDeg: number;
}

export interface DimensionChainStyle {
  /** Half-length of the oblique end slash — the whole tick is twice this. */
  tickHalf: number;
  /** How far above the line the value sits. */
  labelOffset: number;
  /** How far outside the run the chain's overall dimension line sits. */
  totalOffset: number;
}

export function dimensionChainGeometry(points: Point[], style: DimensionChainStyle): DimensionChainGeometry | null {
  if (points.length < 2) return null;
  const { tickHalf, labelOffset, totalOffset } = style;
  const first = points[0];
  const last = points[points.length - 1];

  // Label rotation, normalized to [-90, 90) so text always reads left-to-right or bottom-to-top.
  let angleDeg = (Math.atan2(last.y - first.y, last.x - first.x) * 180) / Math.PI;
  while (angleDeg >= 90) angleDeg -= 180;
  while (angleDeg < -90) angleDeg += 180;
  const rad = (angleDeg * Math.PI) / 180;

  // "Up" as the rotated text itself sees it — so a value is above its line whatever the line's
  // direction (for a vertical dimension that means to its left, like a plan's side dimensions).
  const upX = Math.sin(rad);
  const upY = -Math.cos(rad);
  const shift = (p: Point, d: number): Point => ({ x: p.x + upX * d, y: p.y + upY * d });

  // The end mark is the architectural oblique slash: 45° between the line and its perpendicular.
  const obX = (Math.cos(rad) + upX) / Math.SQRT2;
  const obY = (Math.sin(rad) + upY) / Math.SQRT2;
  const tickAt = (p: Point) => ({
    from: { x: p.x - obX * tickHalf, y: p.y - obY * tickHalf },
    to: { x: p.x + obX * tickHalf, y: p.y + obY * tickHalf },
  });

  const ticks = points.map(tickAt);

  // The value sits centred on its segment, just clear of the dimension line — as drawn on plans.
  const segments = points.slice(0, -1).map((a, i) => {
    const b = points[i + 1];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return { labelPos: shift(mid, labelOffset) };
  });

  let total: DimensionChainGeometry['total'] = null;
  if (points.length > 2) {
    // The overall line runs on the far side of the chain — the segment values sit above the run,
    // the total below it — and carries its own value above itself, as any dimension line does.
    const from = shift(first, -totalOffset);
    const to = shift(last, -totalOffset);
    total = {
      line: { from, to },
      ticks: [tickAt(from), tickAt(to)],
      extensions: [
        { from: shift(first, -tickHalf), to: shift(first, -(totalOffset + tickHalf)) },
        { from: shift(last, -tickHalf), to: shift(last, -(totalOffset + tickHalf)) },
      ],
      labelPos: shift({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, labelOffset),
    };
  }

  return { ticks, segments, total, angleDeg };
}

/** Style derived from the label size, so ticks and offsets scale with the text like a CAD dimension style. */
export function dimensionStyleFor(fontSize: number): DimensionChainStyle {
  return { tickHalf: fontSize * 0.34, labelOffset: fontSize * 0.62, totalOffset: fontSize * 1.9 };
}
