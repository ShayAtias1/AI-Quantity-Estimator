import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEDGER_KEY,
  calendarDaysBetween,
  isReturning,
  loadLedger,
  markActive,
  markFirst,
  markPlanReady,
  saveLedger,
  type KeyValueStore,
} from '../../src/lib/analyticsLedger.ts';
import { createOncePerKey } from '../../src/lib/analyticsDedupe.ts';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const DAY = 86_400_000;
const T0 = new Date(2026, 8, 29, 10, 0).getTime();

test('a new device gets a ledger; a saved one is read back', () => {
  const store = memoryStore();
  const first = loadLedger(store, T0, () => 'device-1');
  assert.equal(first.isNew, true);
  assert.equal(first.ledger.device_id, 'device-1');
  saveLedger(store, first.ledger);
  const again = loadLedger(store, T0 + DAY, () => 'device-2');
  assert.equal(again.isNew, false);
  assert.equal(again.ledger.device_id, 'device-1');
});

test('corrupt or unavailable storage never throws', () => {
  const store = memoryStore();
  store.data.set(LEDGER_KEY, '{not json');
  assert.equal(loadLedger(store, T0, () => 'd').isNew, true);
  const throwing: KeyValueStore = {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };
  const { ledger } = loadLedger(throwing, T0, () => 'd');
  assert.doesNotThrow(() => saveLedger(throwing, ledger));
  assert.equal(loadLedger(null, T0, () => 'd').isNew, true);
});

test('returning = opened on a later calendar day', () => {
  const { ledger } = loadLedger(null, T0, () => 'd');
  assert.equal(isReturning(ledger, T0 + 60_000), false);
  assert.equal(isReturning(ledger, T0 + DAY), true);
  assert.equal(calendarDaysBetween(T0, T0 + 7 * DAY), 7);
  // 23:59 → 00:01 is a new calendar day.
  assert.equal(calendarDaysBetween(new Date(2026, 8, 29, 23, 59).getTime(), new Date(2026, 8, 30, 0, 1).getTime()), 1);
});

test('active days count distinct days with a core action', () => {
  const { ledger } = loadLedger(null, T0, () => 'd');
  assert.equal(markActive(ledger, T0), true);
  assert.equal(markActive(ledger, T0 + 3_600_000), false);
  assert.equal(markActive(ledger, T0 + DAY), true);
  assert.equal(ledger.active_days, 2);
});

test('first milestones are set once', () => {
  const { ledger } = loadLedger(null, T0, () => 'd');
  assert.equal(markFirst(ledger, 'first_export_at', T0), true);
  assert.equal(markFirst(ledger, 'first_export_at', T0 + DAY), false);
  assert.equal(ledger.first_export_at, T0);
});

test('ready plans are remembered once and capped', () => {
  const { ledger } = loadLedger(null, T0, () => 'd');
  assert.equal(markPlanReady(ledger, 'p1'), true);
  assert.equal(markPlanReady(ledger, 'p1'), false);
  for (let i = 0; i < 2100; i++) markPlanReady(ledger, `x${i}`);
  assert.equal(ledger.ready_plan_ids.length, 2000);
});

/** Deterministic fake timers for the settle logic. */
function fakeTimers() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  return {
    timers: {
      set: (fn: () => void, ms: number) => {
        const id = nextId++;
        pending.set(id, { at: now + ms, fn });
        return id;
      },
      clear: (id: unknown) => void pending.delete(id as number),
    },
    advance(ms: number) {
      now += ms;
      for (const [id, t] of [...pending]) {
        if (t.at <= now) {
          pending.delete(id);
          t.fn();
        }
      }
    },
  };
}

test('manual alignment: a drag/slider burst fires once, after it settles', () => {
  const clock = fakeTimers();
  const once = createOncePerKey(1500, clock.timers);
  let fired = 0;
  // 60 transform updates, 16ms apart — one continuous drag.
  for (let i = 0; i < 60; i++) {
    once.settle('cmp:rev:1:manual', () => fired++);
    clock.advance(16);
  }
  assert.equal(fired, 0, 'nothing fires while still moving');
  clock.advance(1500);
  assert.equal(fired, 1);
  // Further adjustments to the same page and revision this session are not new completions.
  once.settle('cmp:rev:1:manual', () => fired++);
  clock.advance(5000);
  assert.equal(fired, 1);
  // Another page is its own alignment.
  once.settle('cmp:rev:2:manual', () => fired++);
  clock.advance(1500);
  assert.equal(fired, 2);
});

test('point-pair alignment fires immediately, once per key', () => {
  const once = createOncePerKey(1500);
  let fired = 0;
  once.now('cmp:rev:1:points', () => fired++);
  once.now('cmp:rev:1:points', () => fired++);
  assert.equal(fired, 1);
});
