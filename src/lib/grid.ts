/**
 * The measurement grid: a view-only overlay whose spacing is a real-world length. Everything here is
 * pure — it turns a calibration (`metersPerPixel`), a spacing in metres and the current zoom into
 * what the viewer draws, in native page pixels like every other overlay shape. Nothing in this file
 * touches quantities, calibration or saved data.
 */

/** The spacing presets of the View menu, in metres. Anything else is "custom". */
export const GRID_PRESETS_M = [0.1, 0.25, 0.5, 1] as const;

export const DEFAULT_GRID_SPACING_M = 1;
export const MIN_GRID_SPACING_M = 0.01;
export const MAX_GRID_SPACING_M = 100;

export const DEFAULT_GRID_OPACITY = 0.4;
export const MIN_GRID_OPACITY = 0.1;
export const MAX_GRID_OPACITY = 1;

/** Below this on-screen gap (CSS px) a line set turns into a smear, so it is not drawn. */
const MIN_SCREEN_GAP_PX = 6;

/** A custom spacing in metres, or null when it is not a usable number. */
export function parseGridSpacing(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  if (n < MIN_GRID_SPACING_M || n > MAX_GRID_SPACING_M) return null;
  return n;
}

export function clampGridOpacity(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_GRID_OPACITY;
  return Math.min(MAX_GRID_OPACITY, Math.max(MIN_GRID_OPACITY, n));
}

/** True for one of the preset spacings (compared with a tolerance, since custom values are typed). */
export function isPresetSpacing(spacingM: number): boolean {
  return GRID_PRESETS_M.some((p) => Math.abs(p - spacingM) < 1e-9);
}

/**
 * Every how-many-th line is a major (stronger) line. Whole metres read best, so spacings that divide
 * 1 m evenly (0.1, 0.25, 0.5, 0.2, …) put a major line every metre; everything else — 1 m, 3 m,
 * 0.3 m — every five lines.
 */
export function majorEvery(spacingM: number): number {
  const perMetre = 1 / spacingM;
  const rounded = Math.round(perMetre);
  if (rounded >= 2 && rounded <= 20 && Math.abs(perMetre - rounded) < 1e-6) return rounded;
  return 5;
}

export interface GridGeometry {
  /** Gap between minor lines, in native page pixels. */
  minorPx: number;
  /** Gap between major lines, in native page pixels (`minorPx * majorEvery`). */
  majorPx: number;
  majorEvery: number;
  showMinor: boolean;
  showMajor: boolean;
}

/**
 * The grid for one page, or null when it cannot exist: no valid scale (a metric grid is never
 * invented before calibration) or an unusable spacing. `zoom` only decides which line sets are
 * legible — it never changes the spacing, which is `spacingM / metersPerPixel` native pixels.
 */
export function computeGrid(metersPerPixel: number, spacingM: number, zoom: number): GridGeometry | null {
  if (!(metersPerPixel > 0) || !Number.isFinite(metersPerPixel)) return null;
  if (!(spacingM > 0) || !Number.isFinite(spacingM)) return null;
  const every = majorEvery(spacingM);
  const minorPx = spacingM / metersPerPixel;
  const majorPx = minorPx * every;
  const z = zoom > 0 ? zoom : 1;
  return {
    minorPx,
    majorPx,
    majorEvery: every,
    showMinor: minorPx * z >= MIN_SCREEN_GAP_PX,
    showMajor: majorPx * z >= MIN_SCREEN_GAP_PX,
  };
}
