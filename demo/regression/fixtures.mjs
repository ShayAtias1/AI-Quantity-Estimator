// Saved records in the shapes older BetterCalc builds wrote, for the before/after regression capture
// (demo/regression/capture.mjs). Plain data — the capture writes them straight into IndexedDB.
//
// - LEGACY_PLAN: a plan saved before projects existed (no projectId), whose measurements carry only
//   their cached Hebrew `label` — no numeric length for distance/perimeter, and one area so old it
//   has no `areaM2` either. Text notes, a dimension chain and a few shapes ride along.
// - LEGACY_COMPARISON: a Revision Compare record from before `revisions[]` existed: a single
//   `revised*` layer, comparison-level markups/measurements without page numbers, no projectId.
//
// Labels are produced exactly the way the viewers produced them when these records were saved.

const PAGE_H = 841.8898; // native page height of the demo plan PDFs
const toNative = (x, y) => ({ x, y: PAGE_H - y });
// The demo plan's own 5.00 m reference line is 320 pt long.
const MPP = 5 / 320;
const CALIBRATION = { pixelDistance: 320, realDistanceMeters: 5, metersPerPixel: MPP };
const T0 = 1_700_000_000_000;

const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const perimeter = (pts) => pts.reduce((s, p, i) => s + dist(p, pts[(i + 1) % pts.length]), 0);
const area = (pts) => Math.abs(pts.reduce((s, p, i) => s + p.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * p.y, 0)) / 2;
const longestEdge = (pts) => Math.max(...pts.map((p, i) => dist(p, pts[(i + 1) % pts.length])));
const rect = (a, b) => [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];

/** The measurement records as the old viewers saved them (PdfViewer / CompareCanvas finishOpenMeasurement). */
function legacyMeasurements(withPage) {
  const page = withPage ? { pageNumber: 1 } : {};
  const d = [toNative(177.2, 120), toNative(463.9, 168.3)];
  const per = [toNative(600, 760), toNative(780, 760), toNative(780, 640), toNative(690, 610)];
  const demo = rect(toNative(980, 700), toNative(1100, 560));
  const wall = [toNative(990, 500), toNative(1130, 500), toNative(1130, 489), toNative(990, 489)];
  const plain = rect(toNative(990, 420), toNative(1080, 330));
  const ancient = rect(toNative(990, 300), toNative(1060, 240));
  const demoArea = round(area(demo) * MPP * MPP, 2);
  const wallLengthM = round(longestEdge(wall) * MPP, 2);
  const wallArea = round(wallLengthM * 2.6, 2);
  const plainArea = round(area(plain) * MPP * MPP, 2);
  return [
    { id: 'm-distance', ...page, tool: 'distance', points: d, label: `${round(dist(d[0], d[1]) * MPP, 2)} מ'` },
    { id: 'm-perimeter', ...page, tool: 'perimeter', points: per, label: `${round(perimeter(per) * MPP, 2)} מ'` },
    { id: 'm-demolition', ...page, tool: 'area', points: demo, label: `${demoArea} מ"ר`, areaKind: 'demolition', areaM2: demoArea, calcMode: 'footprint' },
    {
      id: 'm-wall',
      ...page,
      tool: 'area',
      points: wall,
      label: `${wallArea} מ"ר`,
      areaKind: 'construction',
      areaM2: wallArea,
      calcMode: 'wall',
      wallLengthM,
      wallHeightM: 2.6,
    },
    { id: 'm-plain-area', ...page, tool: 'area', points: plain, label: `${plainArea} מ"ר`, areaM2: plainArea },
    // Saved before area measurements kept `areaM2`: the label is all there is.
    { id: 'm-ancient-area', ...page, tool: 'area', points: ancient, label: `${round(area(ancient) * MPP * MPP, 2)} מ"ר` },
  ];
}

function legacyMarkups(withPage) {
  const page = withPage ? { pageNumber: 1 } : {};
  const chain = [toNative(135, 720), toNative(389.68, 720), toNative(520, 720)];
  const cm = (a, b) => `${Math.round(dist(a, b) * MPP * 100)}`;
  return [
    { id: 'n-multiline', ...page, tool: 'text', points: [toNative(560, 820)], text: 'הערה: לבדוק 2 פתחים\nשורה שנייה (מ"ר)', color: '#dc2626', createdAt: T0 },
    { id: 'n-rotated', ...page, tool: 'text', points: [toNative(1150, 700)], text: 'קיר חדש 20 ס"מ', color: '#2563eb', fontScale: 1.5, rotationDeg: -90, createdAt: T0 },
    { id: 'n-mixed', ...page, tool: 'text', points: [toNative(200, 160)], text: 'BC-12 בדיקה.', color: '#16a34a', fontScale: 0.8, createdAt: T0 },
    {
      id: 'k-dimension',
      ...page,
      tool: 'dimension',
      points: chain,
      text: `${Math.round((dist(chain[0], chain[1]) + dist(chain[1], chain[2])) * MPP * 100)}`,
      segmentTexts: [cm(chain[0], chain[1]), cm(chain[1], chain[2])],
      offset: 18,
      color: '#7c3aed',
      createdAt: T0,
    },
    { id: 'k-cloud', ...page, tool: 'cloud', points: rect(toNative(660, 540), toNative(950, 450)), color: '#dc2626', createdAt: T0 },
    { id: 'k-arrow', ...page, tool: 'arrow', points: [toNative(560, 790), toNative(640, 700)], color: '#dc2626', createdAt: T0 },
  ];
}

const opening = (id, type, widthM, heightM, quantity) => ({ id, type, widthM, heightM, quantity });

export const LEGACY_PLAN = {
  id: 'reg-plan-1',
  name: 'פרויקט רגרסיה',
  createdAt: T0,
  updatedAt: T0,
  pdfFileName: 'קומה-3.pdf',
  pages: { 1: { pageNumber: 1, calibration: CALIBRATION } },
  rooms: [
    {
      id: 'r-master',
      pageNumber: 1,
      points: rect(toNative(135, 694.04), toNative(389.68, 490.52)),
      closed: true,
      name: 'חדר הורים',
      apartmentNumber: '7',
      notes: 'פרקט קיים',
      workItems: [
        { id: 'w1', type: 'tiling', tilingCategory: 'regular' },
        { id: 'w2', type: 'panels' },
        { id: 'w3', type: 'painting' },
      ],
      openings: [opening('o1', 'door', 0.9, 2.1, 1), opening('o2', 'window', 1.2, 1.2, 2)],
      color: '#2563eb',
      roomType: 'bedroom',
    },
    {
      id: 'r-bed1',
      pageNumber: 1,
      points: rect(toNative(135, 480.28), toNative(325.68, 199.96)),
      closed: true,
      name: 'חדר שינה',
      apartmentNumber: '7',
      notes: '',
      workItems: [
        { id: 'w4', type: 'tiling', tilingCategory: 'regular', wastePercent: 7 },
        { id: 'w5', type: 'panels', heightM: 0.12, deductOpenings: false },
        { id: 'w6', type: 'plaster', heightM: 2.4 },
      ],
      openings: [opening('o3', 'door', 0.8, 2.1, 1), opening('o4', 'custom', 1, 1, 1)],
      color: '#16a34a',
    },
    {
      id: 'r-living',
      pageNumber: 1,
      points: rect(toNative(658.72, 531.48), toNative(949.04, 199.96)),
      closed: true,
      name: 'סלון',
      apartmentNumber: '12',
      notes: '',
      workItems: [
        { id: 'w7', type: 'tiling' },
        { id: 'w8', type: 'cladding', heightM: 1.2, wastePercent: 12 },
        { id: 'w9', type: 'panels', wastePercent: 0 },
      ],
      openings: [opening('o5', 'door', 0.9, 2.1, 2), opening('o6', 'window', 2, 1.5, 1)],
      color: '#f59e0b',
      roomType: 'living',
      detectedType: 'living',
      detectionConfidence: 'high',
    },
    {
      id: 'r-bath',
      pageNumber: 1,
      points: [toNative(420, 470), toNative(600, 470), toNative(600, 330), toNative(520, 330), toNative(520, 260), toNative(420, 260)],
      closed: true,
      name: 'חדר רחצה',
      apartmentNumber: '12',
      notes: 'איטום כפול',
      workItems: [
        { id: 'w10', type: 'tiling', tilingCategory: 'as' },
        { id: 'w11', type: 'cladding', heightM: 2.2 },
        { id: 'w12', type: 'waterproofing', heightM: 0.3, wastePercent: 3 },
      ],
      openings: [opening('o7', 'door', 0.7, 2.1, 1), opening('o8', 'window', 0.6, 0.6, 1)],
      color: '#dc2626',
      roomType: 'bath',
    },
  ],
  measurements: legacyMeasurements(true),
  markups: legacyMarkups(true),
  defaultCladdingHeightM: 2,
  defaultTilingWastePercent: 5,
  defaultCladdingWastePercent: 8,
  defaultPanelsWastePercent: 10,
  areaKindColors: { demolition: '#eab308', construction: '#16a34a' },
  wallHeightDefaultM: 2.6,
};

export const LEGACY_COMPARISON = {
  id: 'reg-cmp-1',
  name: 'השוואת רגרסיה',
  apartmentNumber: '12',
  notes: '',
  createdAt: T0,
  updatedAt: T0,
  originalFileName: 'מקור.pdf',
  originalOpacity: 1,
  originalVisible: true,
  originalColorTint: '#2563eb',
  originalUseSourceColors: false,
  revisedFileName: 'גרסה-ב.pdf',
  revisedOpacity: 0.75,
  revisedVisible: true,
  revisedColorTint: '#ef4444',
  revisedUseSourceColors: false,
  pages: {
    1: {
      originalPageNumber: 1,
      originalCalibration: CALIBRATION,
      revisedPageNumber: 1,
      revisedCalibration: null,
      alignment: { offsetX: 0, offsetY: 0, rotationDeg: 0, scale: 1 },
      alignmentPoints: [],
    },
  },
  markups: legacyMarkups(false),
  measurements: legacyMeasurements(false),
  areaKindColors: { demolition: '#eab308', construction: '#16a34a' },
  wallHeightDefaultM: 2.6,
};
