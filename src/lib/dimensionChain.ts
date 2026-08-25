import type { Point } from '../types';
import { distancePx, projectOntoLine, pxToMeters } from './geometry';

/**
 * Moves one stop of a dimension while keeping the run straight: an inner stop slides along the
 * line, and moving an end re-projects the inner stops onto the line the move created.
 */
export function reshapeDimension(points: Point[], index: number, target: Point): Point[] {
  const last = points.length - 1;
  if (points.length <= 2) return points.map((p, i) => (i === index ? target : p));
  if (index !== 0 && index !== last) {
    const onLine = projectOntoLine(points[0], points[last], target);
    return points.map((p, i) => (i === index ? onLine : p));
  }
  const moved = points.map((p, i) => (i === index ? target : p));
  return moved.map((p, i) => (i === 0 || i === last ? p : projectOntoLine(moved[0], moved[last], p)));
}

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
  /** The dimension line itself: the measured points moved out by the markup's offset. */
  line: Point[];
  /** Short oblique "architectural tick" slash at every stop along the dimension line. */
  ticks: { from: Point; to: Point }[];
  /** One entry per measured segment, in the same order as `segmentTexts`. */
  segments: { labelPos: Point }[];
  /** Witness lines running from each measured point out to the dimension line(s). */
  extensions: { from: Point; to: Point }[];
  /**
   * The overall dimension of a chain: a second dimension line parallel to the run, offset outwards,
   * with its own end ticks and label. Null for a single measure.
   */
  total: {
    line: { from: Point; to: Point };
    ticks: { from: Point; to: Point }[];
    labelPos: Point;
  } | null;
  /** Rotation (degrees) that makes label text run along the dimension line, kept upright. */
  angleDeg: number;
  /** Unit normal the dimension line slides along — the only direction it may be moved. */
  up: Point;
}

export interface DimensionChainStyle {
  /** Half-length of the oblique end slash — the whole tick is twice this. */
  tickHalf: number;
  /** How far above the line the value sits. */
  labelOffset: number;
  /** How far outside the run the chain's overall dimension line sits. */
  totalOffset: number;
}

/**
 * `offset` slides the dimension line away from the points it measures, along the run's normal —
 * the only direction a dimension may be moved. The measured points stay put and are joined to the
 * line by extension lines, exactly as a plan draws them.
 *
 * `flipped` mirrors a chain about its own line: the overall line swaps to the other side of the run.
 * Values always sit above their own line, so they stay readable either way.
 */
export function dimensionChainGeometry(
  points: Point[],
  style: DimensionChainStyle,
  offset = 0,
  flipped = false,
): DimensionChainGeometry | null {
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

  const line = points.map((p) => shift(p, offset));
  const ticks = line.map(tickAt);

  // `side` mirrors the dimension about its own line: it moves a chain's overall line to the other
  // side of the run. Values always sit above their own line, flipped or not.
  const side = flipped ? -1 : 1;

  // The value sits centred on its segment, just clear of the dimension line — as drawn on plans.
  const segments = line.slice(0, -1).map((a, i) => {
    const b = line[i + 1];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return { labelPos: shift(mid, labelOffset) };
  });

  let total: DimensionChainGeometry['total'] = null;
  const totalAt = offset - totalOffset * side;
  if (points.length > 2) {
    // The overall line runs parallel to the chain, below it by default and above it when flipped,
    // and carries its own value above itself as any dimension line does.
    const from = shift(first, totalAt);
    const to = shift(last, totalAt);
    total = {
      line: { from, to },
      ticks: [tickAt(from), tickAt(to)],
      labelPos: shift({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, labelOffset),
    };
  }

  // One witness line per measured point. The inner stops run out to their own dimension line and no
  // further, so nothing crosses the overall line of a chain; only the two end stops carry on to it,
  // since that line has to be tied to the run it totals.
  const span = (p: Point, reach: number[]) => {
    const lo = Math.min(0, ...reach);
    const hi = Math.max(0, ...reach);
    if (hi - lo < 1e-6) return null;
    return { from: shift(p, lo === 0 ? 0 : lo - tickHalf), to: shift(p, hi === 0 ? 0 : hi + tickHalf) };
  };
  const extensions = points
    .map((p, i) => span(p, total && (i === 0 || i === points.length - 1) ? [offset, totalAt] : [offset]))
    .filter((e): e is { from: Point; to: Point } => e !== null);

  return { line, ticks, segments, extensions, total, angleDeg, up: { x: upX, y: upY } };
}

/** The one direction a dimension line may be moved along: the normal of the run it measures. */
export function dimensionNormal(points: Point[]): Point {
  const geo = dimensionChainGeometry(points, dimensionStyleFor(1));
  return geo ? geo.up : { x: 0, y: -1 };
}

/** Style derived from the label size, so ticks and offsets scale with the text like a CAD dimension style. */
export function dimensionStyleFor(fontSize: number): DimensionChainStyle {
  return { tickHalf: fontSize * 0.34, labelOffset: fontSize * 0.62, totalOffset: fontSize * 1.9 };
}
