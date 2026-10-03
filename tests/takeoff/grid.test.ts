import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeGrid, majorEvery, parseGridSpacing, clampGridOpacity, isPresetSpacing } from '../../src/lib/grid.ts';
import { readGridPrefs } from '../../src/store/gridStore.ts';

test('spacing in native pixels is the real spacing divided by the scale, independent of zoom', () => {
  // 1 native px = 2 cm
  const a = computeGrid(0.02, 1, 1)!;
  const b = computeGrid(0.02, 1, 8)!;
  assert.equal(a.minorPx, 50);
  assert.equal(b.minorPx, 50);
  assert.equal(computeGrid(0.02, 0.25, 1)!.minorPx, 12.5);
  assert.equal(computeGrid(0.02, 0.1, 1)!.minorPx, 5);
});

test('no valid scale means no grid', () => {
  assert.equal(computeGrid(0, 1, 1), null);
  assert.equal(computeGrid(NaN, 1, 1), null);
  assert.equal(computeGrid(-0.01, 1, 1), null);
  assert.equal(computeGrid(0.01, 0, 1), null);
});

test('major lines fall on whole metres where the spacing divides 1 m', () => {
  assert.equal(majorEvery(0.1), 10);
  assert.equal(majorEvery(0.25), 4);
  assert.equal(majorEvery(0.5), 2);
  assert.equal(majorEvery(1), 5);
  assert.equal(majorEvery(0.3), 5);
  const g = computeGrid(0.01, 0.25, 1)!;
  assert.equal(g.majorPx, 100); // 1 m at 1 cm/px
});

test('lines that would be a smear at this zoom are dropped', () => {
  const g = computeGrid(0.01, 0.1, 0.25)!; // minor gap 10px * 0.25 = 2.5px
  assert.equal(g.showMinor, false);
  assert.equal(g.showMajor, true); // 100px * 0.25
  assert.equal(computeGrid(0.01, 0.1, 2)!.showMinor, true);
});

test('custom spacing parsing', () => {
  assert.equal(parseGridSpacing('0,75'), 0.75);
  assert.equal(parseGridSpacing('2'), 2);
  assert.equal(parseGridSpacing(''), null);
  assert.equal(parseGridSpacing('abc'), null);
  assert.equal(parseGridSpacing(0), null);
  assert.equal(parseGridSpacing(1000), null);
  assert.equal(isPresetSpacing(0.25), true);
  assert.equal(isPresetSpacing(0.3), false);
  assert.equal(clampGridOpacity(5), 1);
  assert.equal(clampGridOpacity(0), 0.1);
});

test('saved preferences are validated field by field', () => {
  assert.deepEqual(readGridPrefs(null), { enabled: false, spacingM: 1, opacity: 0.4 });
  assert.deepEqual(readGridPrefs('{bad'), { enabled: false, spacingM: 1, opacity: 0.4 });
  assert.deepEqual(readGridPrefs('{"enabled":true,"spacingM":0.5,"opacity":0.7}'), { enabled: true, spacingM: 0.5, opacity: 0.7 });
  assert.deepEqual(readGridPrefs('{"enabled":"yes","spacingM":-3,"opacity":"x"}'), { enabled: false, spacingM: 1, opacity: 0.4 });
});
