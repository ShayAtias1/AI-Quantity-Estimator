// Pure geometry for aligning the revised layer onto the original layer.
// The revised layer is rendered with CSS `transform-origin: 50% 50%` and
// `transform: translate(offsetX, offsetY) rotate(rotationDeg) scale(scale)`, which for a point
// `p` local to the revised layer (native px) maps to shared/original-space coordinates as:
//   result = pivot + (offsetX, offsetY) + R(rotationDeg) * scale * (p - pivot)
// The functions below mirror that exact mapping so the math always matches what's on screen.
import type { Point } from '../types';
import type { LayerTransform } from '../types/compare';
import { IDENTITY_TRANSFORM } from '../types/compare';

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function rotate(p: Point, deg: number): Point {
  const rad = toRad(deg);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
}

/** Map a point local to the revised layer (native px) into the shared/original coordinate space. */
export function applyAlignment(localPoint: Point, transform: LayerTransform, pivot: Point): Point {
  const rel = { x: localPoint.x - pivot.x, y: localPoint.y - pivot.y };
  const scaled = { x: rel.x * transform.scale, y: rel.y * transform.scale };
  const rotated = rotate(scaled, transform.rotationDeg);
  return {
    x: pivot.x + transform.offsetX + rotated.x,
    y: pivot.y + transform.offsetY + rotated.y,
  };
}

/** Inverse of applyAlignment: given a point in shared/original space, find the corresponding point local to the (untransformed) revised layer. */
export function invertAlignment(sharedPoint: Point, transform: LayerTransform, pivot: Point): Point {
  const rel = {
    x: sharedPoint.x - pivot.x - transform.offsetX,
    y: sharedPoint.y - pivot.y - transform.offsetY,
  };
  const unrotated = rotate(rel, -transform.rotationDeg);
  const scale = transform.scale || 1;
  return {
    x: pivot.x + unrotated.x / scale,
    y: pivot.y + unrotated.y / scale,
  };
}

/**
 * Solve the similarity transform (translation + rotation + uniform scale) that maps the two
 * revised-layer points (r1, r2) onto the two original-layer points (o1, o2), given the pivot
 * used for the CSS transform-origin.
 */
export function solveAlignment(o1: Point, o2: Point, r1: Point, r2: Point, pivot: Point): LayerTransform {
  const dO = { x: o2.x - o1.x, y: o2.y - o1.y };
  const dR = { x: r2.x - r1.x, y: r2.y - r1.y };
  const lenR = Math.hypot(dR.x, dR.y);
  const lenO = Math.hypot(dO.x, dO.y);
  if (lenR === 0 || lenO === 0) return IDENTITY_TRANSFORM;

  const scale = lenO / lenR;
  const rotationRad = Math.atan2(dO.y, dO.x) - Math.atan2(dR.y, dR.x);
  const rotationDeg = (rotationRad * 180) / Math.PI;

  // t = (o1 - pivot) - R(theta) * scale * (r1 - pivot)
  const r1Rel = { x: r1.x - pivot.x, y: r1.y - pivot.y };
  const scaledR1 = { x: r1Rel.x * scale, y: r1Rel.y * scale };
  const rotatedR1 = rotate(scaledR1, rotationDeg);
  const offsetX = o1.x - pivot.x - rotatedR1.x;
  const offsetY = o1.y - pivot.y - rotatedR1.y;

  return { offsetX, offsetY, rotationDeg, scale };
}
