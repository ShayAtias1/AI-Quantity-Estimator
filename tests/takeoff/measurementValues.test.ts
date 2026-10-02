// Measurement labels are made from stored numbers; measurements saved with only a label recover the
// value that label shows. Either way, what the user sees must be exactly what older builds showed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatAreaM2, formatLengthM, measurementLabel, withMeasurementValues } from '../../src/lib/measurementValues.ts';
import { distancePx, polygonAreaM2, polygonPerimeterM, pxToMeters, round } from '../../src/lib/geometry.ts';
import { numberAreaMeasurements } from '../../src/lib/areaMeasurements.ts';
import type { Measurement, Point } from '../../src/types/index.ts';

/** Deterministic pseudo-random numbers in [0, 1) (Park–Miller), so the sweep is the same every run. */
function sweep() {
  let s = 12345;
  return () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
}

test('new labels are character-for-character what the viewers used to save', () => {
  const next = sweep();
  for (let i = 0; i < 1000; i++) {
    const mpp = 0.001 + next() * 0.05;
    const a: Point = { x: next() * 2000, y: next() * 1500 };
    const b: Point = { x: next() * 2000, y: next() * 1500 };
    const poly: Point[] = [a, b, { x: next() * 2000, y: next() * 1500 }];

    // The old PdfViewer / CompareCanvas formulas, verbatim.
    const oldDistance = `${round(pxToMeters(distancePx(a, b), mpp), 2)} מ'`;
    const oldPerimeter = `${round(polygonPerimeterM(poly, true, mpp), 2)} מ'`;
    const areaM2 = round(polygonAreaM2(poly, mpp), 2);
    const oldArea = `${areaM2} מ"ר`;

    // What they store and show now.
    assert.equal(measurementLabel({ tool: 'distance', lengthM: round(pxToMeters(distancePx(a, b), mpp), 2) }), oldDistance);
    assert.equal(measurementLabel({ tool: 'perimeter', lengthM: round(polygonPerimeterM(poly, true, mpp), 2) }), oldPerimeter);
    assert.equal(measurementLabel({ tool: 'area', areaM2 }), oldArea);
  }
  assert.equal(formatLengthM(3.24), "3.24 מ'");
  assert.equal(formatAreaM2(12.5), '12.5 מ"ר');
  assert.equal(formatLengthM(0), "0 מ'");
  // Even a value that should never be stored shows as the old template showed it.
  assert.equal(measurementLabel({ tool: 'distance', lengthM: Number.NaN }), `${round(Number.NaN, 2)} מ'`);
});

const legacy = (m: Partial<Measurement> & Pick<Measurement, 'id' | 'tool' | 'label'>): Measurement => ({ pageNumber: 1, points: [], ...m });

test('legacy distances and perimeters recover the value their label shows', () => {
  const saved = [
    legacy({ id: 'a', tool: 'distance', label: "4.54 מ'" }),
    legacy({ id: 'b', tool: 'perimeter', label: "12 מ'" }),
    legacy({ id: 'c', tool: 'distance', label: "0 מ'" }),
    legacy({ id: 'd', tool: 'distance', label: "1234.05 מ'" }),
  ];
  const read = withMeasurementValues(saved);
  assert.deepEqual(read.map((m) => m.lengthM), [4.54, 12, 0, 1234.05]);
  // Exactly the text it showed before, and the old label is still on the record.
  read.forEach((m, i) => {
    assert.equal(measurementLabel(m), saved[i].label);
    assert.equal(m.label, saved[i].label);
  });
});

test('never re-measured: the saved value wins over the current geometry and calibration', () => {
  // Points say 5 m at this scale; the label saved 4.99 — 4.99 is what the user has always seen.
  const m = legacy({ id: 'a', tool: 'distance', label: "4.99 מ'", points: [{ x: 0, y: 0 }, { x: 320, y: 0 }] });
  const [read] = withMeasurementValues([m]);
  assert.equal(read.lengthM, 4.99);
  assert.equal(measurementLabel(read), "4.99 מ'");
});

test('labels that do not read back exactly are left alone and shown as saved', () => {
  const odd = [
    legacy({ id: 'a', tool: 'distance', label: '' }),
    legacy({ id: 'b', tool: 'distance', label: "4.540 מ'" }),
    legacy({ id: 'c', tool: 'distance', label: 'מרחק' }),
    legacy({ id: 'd', tool: 'perimeter', label: '4.54 m' }),
  ];
  const read = withMeasurementValues(odd);
  assert.equal(read, odd, 'nothing to fill: the same array comes back');
  read.forEach((m, i) => {
    assert.equal(m.lengthM, undefined);
    assert.equal(measurementLabel(m), odd[i].label);
  });
  assert.equal(measurementLabel({ tool: 'distance' }), '');
});

test('areas: never back-filled, so totals and exports cannot change', () => {
  const saved = [
    legacy({ id: 'kept', tool: 'area', label: '4.1 מ"ר', areaM2: 4.1, areaKind: 'demolition' }),
    // Saved before areas kept areaM2 (and later tagged): it has never counted toward a total.
    legacy({ id: 'ancient', tool: 'area', label: '7.5 מ"ר', areaKind: 'construction' }),
  ];
  const read = withMeasurementValues(saved);
  assert.equal(read, saved);
  assert.equal(read[1].areaM2, undefined);
  assert.equal(measurementLabel(read[0]), '4.1 מ"ר');
  assert.equal(measurementLabel(read[1]), '7.5 מ"ר');
  assert.deepEqual(numberAreaMeasurements(read), numberAreaMeasurements(saved));
});

test('idempotent, and new measurements are untouched', () => {
  const saved = [legacy({ id: 'a', tool: 'distance', label: "4.54 מ'" }), { id: 'n', pageNumber: 1, tool: 'distance' as const, points: [], lengthM: 2.5 }];
  const once = withMeasurementValues(saved);
  const twice = withMeasurementValues(once);
  assert.equal(twice, once);
  assert.equal(once[1], saved[1]);
  assert.equal(measurementLabel(once[1]), "2.5 מ'");
});
