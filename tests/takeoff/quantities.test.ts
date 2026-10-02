// Safety net for the takeoff numbers: every value a report can print is pinned to a snapshot, at full
// precision where the code works unrounded, so a refactor cannot shift a quantity by even a rounding
// step without failing here. Update snapshots only for an intended calculation change:
//   npm test -- --test-update-snapshots
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReportCategoryTotals,
  buildRoomSummaries,
  calculateWorkItem,
  effectiveWastePercent,
  roomMetrics,
  roomOpeningDetails,
} from '../../src/lib/quantities.ts';
import { buildProjectQuantities } from '../../src/lib/projectQuantities.ts';
import { numberAreaMeasurements } from '../../src/lib/areaMeasurements.ts';
import { dimensionLabels } from '../../src/lib/dimensionChain.ts';
import { MEASUREMENTS, MPP, PLAN_A, PLAN_B } from './fixtures.ts';

test('room metrics and every work item, unrounded', (t) => {
  for (const plan of [PLAN_A, PLAN_B]) {
    const rooms = plan.rooms.map((room) => {
      const { areaM2, perimeterM } = roomMetrics(room, plan.pages[room.pageNumber]?.calibration ?? null);
      return {
        room: room.id,
        areaM2,
        perimeterM,
        items: room.workItems.map((item) => ({
          item: item.id,
          ...calculateWorkItem(item, room, areaM2, perimeterM, plan),
          waste: effectiveWastePercent(item, plan),
        })),
        openings: roomOpeningDetails(room).map((d) => ({ id: d.opening.id, areaM2: d.areaM2, deductedFrom: d.deductedFrom })),
      };
    });
    t.assert.snapshot(rooms);
  }
});

test('room quantity summaries', (t) => {
  t.assert.snapshot(buildRoomSummaries(PLAN_A));
  t.assert.snapshot(buildRoomSummaries(PLAN_B));
});

test('report category totals', (t) => {
  t.assert.snapshot(buildReportCategoryTotals(PLAN_A, buildRoomSummaries(PLAN_A)));
  t.assert.snapshot(buildReportCategoryTotals(PLAN_B, buildRoomSummaries(PLAN_B)));
});

test('project quantities', (t) => {
  const q = buildProjectQuantities([PLAN_A, PLAN_B]);
  // Plans are carried by reference; only what the reports read off them is pinned.
  t.assert.snapshot({ ...q, plans: q.plans.map(({ plan, ...rest }) => ({ plan: plan.id, ...rest })) });
});

test('hand-checked anchors', () => {
  const [master, , living] = buildRoomSummaries(PLAN_A);
  // 254.68 × 203.52 pt at 5/320 m per pt.
  assert.equal(master.tilingRegularAreaM2, 12.65);
  // Order = net × (1 + project tiling waste 5%).
  assert.equal(master.tilingRegularOrderM2, 13.29);
  // Living room cladding: perimeter 19.4325 m × 1.2 m − 2 doors 0.9 × 1.2 (clipped to the 1.2 m
  // cladding) − window 2 × 1.2 = 23.319 − 4.56.
  assert.equal(living.claddingAreaM2, 18.76);
  const uncalibrated = buildRoomSummaries(PLAN_A).find((s) => s.roomId === 'r-uncalibrated')!;
  assert.equal(uncalibrated.pageCalibrated, false);
  assert.equal(uncalibrated.tilingRegularAreaM2, null);
});

test('area measurement numbering', (t) => {
  const numbers = numberAreaMeasurements(MEASUREMENTS);
  t.assert.snapshot(Object.fromEntries(numbers));
  assert.equal(numbers.has('m-distance'), false);
  assert.equal(numbers.has('m-plain'), false);
});

test('dimension labels: whole centimetres, no unit', (t) => {
  const single = dimensionLabels([{ x: 0, y: 0 }, { x: 320, y: 0 }], MPP);
  assert.deepEqual(single, { segmentTexts: ['500'], text: '500' });
  const chain = dimensionLabels([{ x: 135, y: 121.85 }, { x: 389.68, y: 121.85 }, { x: 520, y: 121.85 }], MPP);
  assert.deepEqual(chain, { segmentTexts: ['398', '204'], text: '602' });
  t.assert.snapshot([
    dimensionLabels([{ x: 0, y: 0 }, { x: 33.3, y: 44.4 }], MPP),
    dimensionLabels([{ x: 10, y: 10 }, { x: 10, y: 97.123 }, { x: 10, y: 250.5 }, { x: 10, y: 251 }], MPP),
    dimensionLabels([{ x: 0, y: 0 }, { x: 0.31, y: 0 }], MPP),
  ]);
});
