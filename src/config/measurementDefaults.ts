/**
 * Central measurement defaults for the quantity takeoff. New projects are seeded from here, and the
 * calculation code falls back to these values when an older saved project lacks a field — so a
 * default lives in one place instead of being repeated across the store, components and exports.
 *
 * Deliberately free of imports: `types/index.ts` re-exports from it.
 */
export const MEASUREMENT_DEFAULTS = {
  /** Wall cladding height (m) for new cladding items. */
  claddingHeightM: 2.0,
  /** Panel (skirting) strip height (m). Also the historical fallback for projects saved without one. */
  panelHeightM: 0.1,
  /** Full wall height (m): painting and plaster, and 'wall' calc-mode area measurements. */
  wallHeightM: 2.5,
  /**
   * How far waterproofing turns up the walls (m). 0 = floor only; set a height per item to add the
   * perimeter strip.
   */
  waterproofingUpturnM: 0,
} as const;

/** Default size (m) a new opening starts with, per opening type. The user edits them afterwards. */
export const OPENING_DEFAULT_SIZES = {
  door: { widthM: 0.9, heightM: 2.1 },
  window: { widthM: 1.2, heightM: 1.2 },
  custom: { widthM: 1.0, heightM: 1.0 },
} as const;
