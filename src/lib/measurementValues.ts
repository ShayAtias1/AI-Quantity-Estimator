/**
 * Measurement values and the text shown for them, shared by both apps.
 *
 * A measurement stores numbers — `lengthM` for a distance or perimeter, `areaM2` for an area — and
 * its label is made from them wherever it is shown (both viewers, both sidebars, the PDF raster), so
 * no display text is saved with it. Older builds saved the label text instead ("3.24 מ'") and, for a
 * distance or perimeter, no number at all; `withMeasurementValues` recovers that number from the
 * saved label when a document is read.
 */

import { AREA_UNIT } from '../types';
import { round } from './geometry';

const LENGTH_UNIT = "מ'";

/** The fields a label is made from — common to both apps' `Measurement` types. */
export interface MeasurementValueFields {
  tool: string;
  lengthM?: number;
  areaM2?: number;
  /** Legacy: the label text older builds saved. Only ever read to recover their value. */
  label?: string;
}

/** A distance or perimeter as shown: metres to the centimetre ("3.24 מ'"). */
export function formatLengthM(lengthM: number): string {
  return `${round(lengthM, 2)} ${LENGTH_UNIT}`;
}

/** An area as shown. `areaM2` is stored already rounded to two decimals. */
export function formatAreaM2(areaM2: number): string {
  return `${areaM2} ${AREA_UNIT}`;
}

// The exact label formats older builds saved. Fixed for good — they describe data already on disk,
// not how anything is shown now — so recovery keeps working whatever the display format becomes.
const savedLengthLabel = (lengthM: number) => `${round(lengthM, 2)} מ'`;
const savedAreaLabel = (areaM2: number) => `${areaM2} מ"ר`;

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
// Any stored number is formatted, as the old label template did — even one that is not finite.
const isNumber = (v: unknown): v is number => typeof v === 'number';

/**
 * The number an older build's saved label shows, or null. Accepted only when writing that number
 * back in the same format gives the identical label, so a recovered value can never show differently.
 */
function valueFromSavedLabel(label: string | undefined, format: (v: number) => string): number | null {
  const match = /^\d+(?:\.\d+)?(?= )/.exec(label ?? '');
  if (!match) return null;
  const value = Number(match[0]);
  return format(value) === label ? value : null;
}

/** The text shown for a measurement, made from its stored number. */
export function measurementLabel(m: MeasurementValueFields): string {
  if (m.tool === 'area') {
    if (isNumber(m.areaM2)) return formatAreaM2(m.areaM2);
    // Saved before areas kept `areaM2`. The number is read off the label for display only: storing it
    // as `areaM2` would start counting these areas in totals that have always left them out.
    const legacy = valueFromSavedLabel(m.label, savedAreaLabel);
    return legacy != null ? formatAreaM2(legacy) : (m.label ?? '');
  }
  if (isNumber(m.lengthM)) return formatLengthM(m.lengthM);
  return m.label ?? '';
}

/**
 * Gives each distance and perimeter saved before `lengthM` existed the value its saved label shows —
 * exactly what it has always displayed, never re-measured against the page's current calibration.
 * A label that cannot be read back exactly is left as it is (and keeps being shown as it is). The
 * saved label stays on the record. Idempotent; returns the same array when nothing needed filling.
 */
export function withMeasurementValues<T extends MeasurementValueFields>(measurements: T[]): T[] {
  let changed = false;
  const out = measurements.map((m) => {
    if ((m.tool !== 'distance' && m.tool !== 'perimeter') || isFiniteNumber(m.lengthM)) return m;
    const lengthM = valueFromSavedLabel(m.label, savedLengthLabel);
    if (lengthM == null) return m;
    changed = true;
    return { ...m, lengthM };
  });
  return changed ? out : measurements;
}
