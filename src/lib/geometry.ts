import type { Point } from '../types';

/** Shoelace formula — area in px^2 (page coordinates). */
export function polygonAreaPx(points: Point[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** Perimeter in px (page coordinates). Closed polygon (wraps last->first). */
export function polygonPerimeterPx(points: Point[], closed: boolean): number {
  if (points.length < 2) return 0;
  let sum = 0;
  const n = closed ? points.length : points.length - 1;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += distancePx(a, b);
  }
  return sum;
}

/** Area-weighted centroid of a polygon (falls back to the vertex average for degenerate/near-zero-area shapes). */
export function polygonCentroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  const vertexAverage = () => ({
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length,
  });
  if (points.length < 3) return vertexAverage();

  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  area *= 0.5;
  if (Math.abs(area) < 1e-9) return vertexAverage();
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

export function distancePx(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Snaps `candidate` so the segment from `from` is purely horizontal or vertical, whichever it's closer to. */
export function snapOrtho(from: Point, candidate: Point): Point {
  const dx = candidate.x - from.x;
  const dy = candidate.y - from.y;
  return Math.abs(dx) >= Math.abs(dy) ? { x: candidate.x, y: from.y } : { x: from.x, y: candidate.y };
}

export function pxToMeters(px: number, metersPerPixel: number): number {
  return px * metersPerPixel;
}

/** Area in m^2 given page points and meters-per-pixel scale. */
export function polygonAreaM2(points: Point[], metersPerPixel: number): number {
  const areaPx = polygonAreaPx(points);
  return areaPx * metersPerPixel * metersPerPixel;
}

/** Perimeter in meters given page points and meters-per-pixel scale. */
export function polygonPerimeterM(points: Point[], closed: boolean, metersPerPixel: number): number {
  return polygonPerimeterPx(points, closed) * metersPerPixel;
}

export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Find the nearest vertex to a point within a pixel radius (in page coords, already scale-adjusted by caller). */
export function nearestPointIndex(points: Point[], target: Point, maxDist: number): number {
  let best = -1;
  let bestDist = maxDist;
  points.forEach((p, i) => {
    const d = distancePx(p, target);
    if (d <= bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

/** Build an SVG path `d` string for a "revision cloud" — a closed polygon outlined with outward-bulging arcs. */
export function cloudPath(points: Point[], bumpSize: number): string {
  if (points.length < 3) return '';
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  let d = `M ${points[0].x} ${points[0].y} `;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    const segments = Math.max(1, Math.round(len / bumpSize));
    const segLen = len / segments;
    const r = (segLen / 2) * 1.15;
    const nx = -dy / len;
    const ny = dx / len;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const towardCentroid = (cx - midX) * nx + (cy - midY) * ny;
    const sweep = towardCentroid > 0 ? 0 : 1;
    for (let s = 1; s <= segments; s++) {
      const t = s / segments;
      const px = a.x + dx * t;
      const py = a.y + dy * t;
      d += `A ${r} ${r} 0 0 ${sweep} ${px} ${py} `;
    }
  }
  return `${d}Z`;
}
