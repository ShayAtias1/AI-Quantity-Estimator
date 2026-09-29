import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Plan, Room, WorkItem } from '../../src/types/index.ts';
import { loadLedger } from '../../src/lib/analyticsLedger.ts';
import { baselinePlanReadiness, planQuantityStatus, reportContents, takeQuantitiesReady } from '../../src/lib/analyticsMilestones.ts';
import { buildRoomSummaries } from '../../src/lib/quantities.ts';

/** 1 px = 1 cm. */
const CALIBRATED = { pageNumber: 1, calibration: { pixelDistance: 100, realDistanceMeters: 1, metersPerPixel: 0.01 } };

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-1',
    projectId: 'project-1',
    name: 'קומה 3',
    createdAt: 0,
    updatedAt: 0,
    pdfFileName: 'client.pdf',
    pages: {},
    rooms: [],
    measurements: [],
    markups: [],
    defaultCladdingHeightM: 2.6,
    defaultPanelHeightM: 0.1,
    defaultTilingWastePercent: 0,
    defaultTilingAsWastePercent: 0,
    defaultCladdingWastePercent: 0,
    defaultPanelsWastePercent: 0,
    areaKindColors: { demolition: '#eab308', construction: '#16a34a' },
    wallHeightDefaultM: 2.6,
    ...overrides,
  };
}

function room(id: string, workItems: WorkItem[], pageNumber = 1, size = 400): Room {
  return {
    id,
    pageNumber,
    points: [
      { x: 0, y: 0 },
      { x: size, y: 0 },
      { x: size, y: size },
      { x: 0, y: size },
    ],
    closed: true,
    name: 'סלון',
    apartmentNumber: '12',
    notes: '',
    workItems,
    color: '#000',
  };
}

const tiling: WorkItem = { id: 'w1', type: 'tiling', tilingCategory: 'regular' };
const painting: WorkItem = { id: 'w2', type: 'painting', heightM: 2.6 };

test('not ready: room with work but the page has no scale', () => {
  assert.equal(planQuantityStatus(plan({ rooms: [room('r1', [tiling])] })).ready, false);
});

test('not ready: calibrated page, room, but no work items', () => {
  assert.equal(planQuantityStatus(plan({ pages: { 1: CALIBRATED }, rooms: [room('r1', [])] })).ready, false);
});

test('not ready: a degenerate room yields a zero quantity', () => {
  assert.equal(planQuantityStatus(plan({ pages: { 1: CALIBRATED }, rooms: [room('r1', [tiling], 1, 0)] })).ready, false);
});

test('ready: calibrated page + room + work item with a quantity > 0', () => {
  const status = planQuantityStatus(plan({ pages: { 1: CALIBRATED }, rooms: [room('r1', [tiling, painting]), room('r2', [tiling], 2)] }));
  assert.deepEqual(status, { ready: true, roomsWithQty: 1, workTypes: ['tiling', 'painting'] });
});

test('quantities_ready is taken once per plan — undo/redo and later saves do not repeat it', () => {
  const { ledger } = loadLedger(null, 0, () => 'd');
  const empty = plan({ pages: { 1: CALIBRATED } });
  const ready = plan({ pages: { 1: CALIBRATED }, rooms: [room('r1', [tiling])] });

  assert.equal(takeQuantitiesReady(ledger, empty), null);
  assert.ok(takeQuantitiesReady(ledger, ready), 'first save with a quantity');
  assert.equal(takeQuantitiesReady(ledger, ready), null, 'later save');
  assert.equal(takeQuantitiesReady(ledger, empty), null, 'undo back to nothing');
  assert.equal(takeQuantitiesReady(ledger, ready), null, 'redo');
  assert.ok(takeQuantitiesReady(ledger, { ...ready, id: 'plan-2' }), 'another plan is its own milestone');
});

test('a plan that already has quantities when loaded is baselined silently', () => {
  const { ledger } = loadLedger(null, 0, () => 'd');
  const finished = plan({ pages: { 1: CALIBRATED }, rooms: [room('r1', [tiling])] });
  assert.equal(baselinePlanReadiness(ledger, finished), true);
  assert.equal(takeQuantitiesReady(ledger, finished), null);
  // An unfinished plan is not baselined, so it can still activate later.
  const unfinished = plan({ id: 'plan-3', pages: { 1: CALIBRATED } });
  assert.equal(baselinePlanReadiness(ledger, unfinished), false);
  assert.ok(takeQuantitiesReady(ledger, { ...unfinished, rooms: [room('r1', [tiling])] }));
});

test('report contents: work types and waste, from the report summaries', () => {
  const p = plan({ pages: { 1: CALIBRATED }, rooms: [room('r1', [tiling]), room('r2', [{ ...painting, wastePercent: 10 }])] });
  assert.deepEqual(reportContents([{ plan: p, summaries: buildRoomSummaries(p) }]), {
    workTypes: ['tiling', 'painting'],
    wasteApplied: true,
    roomCount: 2,
  });
  const noWaste = plan({ pages: { 1: CALIBRATED }, rooms: [room('r1', [tiling])] });
  assert.equal(reportContents([{ plan: noWaste, summaries: buildRoomSummaries(noWaste) }]).wasteApplied, false);
});
