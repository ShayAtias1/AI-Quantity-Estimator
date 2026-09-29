/**
 * The analytics-owned local ledger: first-seen date, active days, first milestones, first-touch
 * attribution and the once-per-plan `quantities_ready` record. It is what makes new-vs-returning
 * and day-N retention measurable without accounts, and it outlives a change of analytics vendor.
 *
 * Kept in its own localStorage key, entirely separate from BetterCalc's project data (IndexedDB).
 * Pure functions over an injected storage so the tests run under plain Node; `analytics.ts` passes
 * `window.localStorage`. Every storage access tolerates a throwing or empty store (private mode,
 * blocked site data) — the worst case is a device that looks new on each load.
 */

import type { UtmParams } from './analyticsPrivacy';

export const LEDGER_KEY = 'bc_analytics_ledger_v1';
/** Enough for years of plans on one device; the oldest ids fall off first. */
const MAX_READY_PLANS = 2000;

export interface Ledger {
  v: 1;
  /** Anonymous device id — also PostHog's distinct id (bootstrapped), so identity is owned here. */
  device_id: string;
  first_seen_at: number;
  /** Local calendar day (YYYY-MM-DD) of the last day with a core action. */
  last_active_day: string | null;
  /** Count of distinct local days with at least one core action. */
  active_days: number;
  first_project_at: number | null;
  first_comparison_at: number | null;
  /** First `quantities_ready` or `alignment_completed` — takeoff or compare activation. */
  first_activation_at: number | null;
  first_export_at: number | null;
  /** UTMs of the very first attributed visit on this device. */
  first_touch: UtmParams | null;
  /** Plans that already reached `quantities_ready` (or already had quantities when first seen). */
  ready_plan_ids: string[];
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Local calendar day, YYYY-MM-DD. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Whole calendar days from `fromTs` to `toTs` in local time (DST-safe: counts midnights, not 24h blocks). */
export function calendarDaysBetween(fromTs: number, toTs: number): number {
  const a = new Date(fromTs);
  const b = new Date(toTs);
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.max(0, Math.round((utcB - utcA) / 86_400_000));
}

function isLedger(value: unknown): value is Ledger {
  const l = value as Ledger;
  return !!l && l.v === 1 && typeof l.device_id === 'string' && typeof l.first_seen_at === 'number' && Array.isArray(l.ready_plan_ids);
}

/** Reads the ledger, or starts a new one for a device seen for the first time. `isNew` is true in that case. */
export function loadLedger(store: KeyValueStore | null, now: number, newId: () => string): { ledger: Ledger; isNew: boolean } {
  try {
    const raw = store?.getItem(LEDGER_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isLedger(parsed)) return { ledger: parsed, isNew: false };
    }
  } catch {
    // Corrupt or unreadable — treated as a new device below.
  }
  return {
    isNew: true,
    ledger: {
      v: 1,
      device_id: newId(),
      first_seen_at: now,
      last_active_day: null,
      active_days: 0,
      first_project_at: null,
      first_comparison_at: null,
      first_activation_at: null,
      first_export_at: null,
      first_touch: null,
      ready_plan_ids: [],
    },
  };
}

export function saveLedger(store: KeyValueStore | null, ledger: Ledger): void {
  try {
    store?.setItem(LEDGER_KEY, JSON.stringify(ledger));
  } catch {
    // Quota or blocked storage: analytics degrades to per-load identity, the app is unaffected.
  }
}

/** A device is returning once it is opened on a later calendar day than it was first seen. */
export function isReturning(ledger: Ledger, now: number): boolean {
  return calendarDaysBetween(ledger.first_seen_at, now) > 0;
}

/** Records a core action today. Returns true when this is the first one of the day (the ledger changed). */
export function markActive(ledger: Ledger, now: number): boolean {
  const today = dayKey(now);
  if (ledger.last_active_day === today) return false;
  ledger.last_active_day = today;
  ledger.active_days += 1;
  return true;
}

/** Sets a first-milestone timestamp once. Returns true when it was not set before. */
export function markFirst(
  ledger: Ledger,
  field: 'first_project_at' | 'first_comparison_at' | 'first_activation_at' | 'first_export_at',
  now: number
): boolean {
  if (ledger[field] != null) return false;
  ledger[field] = now;
  return true;
}

export function isPlanReady(ledger: Ledger, planId: string): boolean {
  return ledger.ready_plan_ids.includes(planId);
}

/** Remembers a plan as having reached quantities. Returns true only the first time for that plan. */
export function markPlanReady(ledger: Ledger, planId: string): boolean {
  if (ledger.ready_plan_ids.includes(planId)) return false;
  ledger.ready_plan_ids.push(planId);
  if (ledger.ready_plan_ids.length > MAX_READY_PLANS) ledger.ready_plan_ids.splice(0, ledger.ready_plan_ids.length - MAX_READY_PLANS);
  return true;
}
