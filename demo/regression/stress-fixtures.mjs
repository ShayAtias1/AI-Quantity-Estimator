// Export hardening fixtures: records big enough to push every export table onto extra pages, with long
// realistic English names (and a few Hebrew ones, which must stay untouched in English exports).
//   - STRESS_PLAN_1: 2 pages x 40 rooms, long names, many area measurements (change/area tables overflow)
//   - STRESS_PLAN_2: a second, smaller plan; STRESS_PROJECT folds them and the comparison together
//   - STRESS_COMPARISON: a 2-page original with 3 revisions; revision 3 only has page 1, so its page-2 pair
//     must be skipped, not exported as a source-only page
// Page size and calibration are those of the demo plan PDFs (the stress PDFs repeat that page).
const PAGE_H = 841.8898;
const T0 = 1_700_000_000_000;
const toNative = (x, y) => ({ x, y: PAGE_H - y });
const CAL = { pixelDistance: 320, realDistanceMeters: 40, metersPerPixel: 40 / 320 };
const rect = (a, b) => [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
const area = (pts) => Math.abs(pts.reduce((s, p, i) => s + p.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * p.y, 0)) / 2;
const round2 = (v) => Math.round(v * 100) / 100;

const NAMES = [
  'Master Bedroom Ensuite Bathroom with Walk-in Closet',
  'Open-plan Kitchen, Dining and Living Area',
  "Children's Bedroom (North-facing, Shared)",
  'Main Entrance Lobby and Mail Room',
  'Guest WC / Powder Room',
  'Utility and Laundry Room',
  'Staircase Landing — Level 3 to Level 4',
  'Mechanical & Electrical Riser Cupboard',
  'חדר הורים עם חדר רחצה צמוד',
  'Covered Balcony (Sun Terrace, South Side)',
  'Accessible Bathroom 2',
  'Study',
];
const APARTMENTS = ['7', '12B-West', '104', '3A', 'Penthouse 2'];
const TYPES = ['tiling', 'cladding', 'panels', 'plaster', 'painting', 'waterproofing'];

function rooms(prefix, page, count) {
  return Array.from({ length: count }, (_, i) => {
    const col = i % 8;
    const row = Math.floor(i / 8);
    const a = toNative(40 + col * 135, 40 + row * 140);
    const b = toNative(40 + col * 135 + 120, 40 + row * 140 + 120);
    const items = [
      { id: `${prefix}${page}-${i}-a`, type: 'tiling', tilingCategory: i % 3 === 0 ? 'as' : 'regular', ...(i % 5 === 0 ? { wastePercent: 12 } : {}) },
      { id: `${prefix}${page}-${i}-b`, type: TYPES[1 + (i % 5)], heightM: 2.4 },
    ];
    if (i % 4 === 0) items.push({ id: `${prefix}${page}-${i}-c`, type: 'panels' });
    return {
      id: `${prefix}${page}-${i}`,
      pageNumber: page,
      points: rect(a, b),
      closed: true,
      name: `${NAMES[(i + page) % NAMES.length]}${i >= NAMES.length ? ` #${i + 1}` : ''}`,
      apartmentNumber: APARTMENTS[i % APARTMENTS.length],
      notes: i % 6 === 0 ? 'Existing parquet to be removed before tiling' : '',
      workItems: items,
      openings: [{ id: `${prefix}${page}-${i}-o`, type: 'door', widthM: 0.9, heightM: 2.1, quantity: 1 + (i % 3) }],
      color: '#2563eb',
    };
  });
}

function areas(prefix, page, count) {
  return Array.from({ length: count }, (_, i) => {
    const a = toNative(40 + (i % 10) * 105, 600 + Math.floor(i / 10) * 60);
    const b = toNative(40 + (i % 10) * 105 + 90, 600 + Math.floor(i / 10) * 60 + 45);
    const pts = rect(a, b);
    const areaM2 = round2(area(pts) * CAL.metersPerPixel ** 2);
    const wall = i % 4 === 3;
    return {
      id: `${prefix}-${page}-${i}`,
      pageNumber: page,
      tool: 'area',
      points: pts,
      label: `${areaM2} מ"ר`,
      areaKind: i % 2 === 0 ? 'demolition' : 'construction',
      areaM2,
      calcMode: wall ? 'wall' : 'footprint',
      ...(wall ? { wallLengthM: 6.4, wallHeightM: 2.6 } : {}),
    };
  });
}

const plan = (id, name, fileName, pageRooms, withAreas) => ({
  id,
  name,
  createdAt: T0,
  updatedAt: T0,
  pdfFileName: fileName,
  pages: { 1: { pageNumber: 1, calibration: CAL }, 2: { pageNumber: 2, calibration: CAL } },
  rooms: pageRooms,
  measurements: withAreas ? [...areas('pm', 1, 14), ...areas('pm', 2, 14)] : [],
  markups: [],
  defaultCladdingHeightM: 2,
  defaultTilingWastePercent: 5,
  defaultCladdingWastePercent: 8,
  defaultPanelsWastePercent: 10,
  areaKindColors: { demolition: '#eab308', construction: '#16a34a' },
  wallHeightDefaultM: 2.6,
});

export const STRESS_PLAN_1 = plan('st-plan-1', 'Building A — Level 3 and Level 4 Residential Floors, Final Issue for Construction', 'Building-A-Levels-3-4-FFC-Rev-D.pdf', [...rooms('r', 1, 40), ...rooms('r', 2, 40)], true);
export const STRESS_PLAN_2 = plan('st-plan-2', 'Building B — Podium Retail Units', 'Building-B-Podium.pdf', [...rooms('s', 1, 14), ...rooms('s', 2, 6)], false);
export const STRESS_PROJECT = {
  id: 'st-project',
  name: 'Riverside Residential Complex — Phases 2 and 3 (Buildings A–C), Tenant Finishing Package',
  createdAt: T0,
  updatedAt: T0,
  planIds: ['st-plan-1', 'st-plan-2'],
  comparisonIds: ['st-cmp'],
};

const identity = { offsetX: 0, offsetY: 0, rotationDeg: 0, scale: 1 };
const REVISIONS = [
  ['rev-1', 'Architect Revision B — Structural Changes to Stairwell and Lift Core, Including Revised Fire-Rated Partitions on Levels 3 and 4', 'Rev-B.pdf', '#ef4444'],
  ['rev-2', 'Revision C (client-requested layout changes, issued 12 September)', 'Rev-C.pdf', '#16a34a'],
  ['rev-3', 'Rev D', 'Rev-D.pdf', '#7c3aed'],
];
export const STRESS_COMPARISON = {
  id: 'st-cmp',
  projectId: 'st-project',
  name: 'Level 3 Layout Comparison — Original vs. All Issued Revisions, Including the Structural and Mechanical Coordination Changes Requested by the Client and Consultants',
  apartmentNumber: '12B-West',
  notes: '',
  createdAt: T0,
  updatedAt: T0,
  originalFileName: 'Level-3-Original.pdf',
  originalOpacity: 1,
  originalVisible: true,
  originalColorTint: '#2563eb',
  originalUseSourceColors: false,
  pages: Object.fromEntries(
    [1, 2].map((p) => [
      p,
      {
        originalPageNumber: p,
        originalCalibration: { ...CAL, space: 'original' },
        revisions: Object.fromEntries(REVISIONS.map(([id]) => [id, { revisedPageNumber: p, revisedCalibration: null, alignment: identity, alignmentPoints: [] }])),
      },
    ])
  ),
  revisions: REVISIONS.map(([id, label, fileName, colorTint], r) => ({
    id,
    label,
    fileName,
    opacity: 0.75,
    visible: true,
    colorTint,
    useSourceColors: false,
    markups: [],
    measurements: [...areas(`c${r}`, 1, 16 + r * 6), ...areas(`c${r}`, 2, 10)],
  })),
  activeRevisionId: 'rev-1',
  areaKindColors: { demolition: '#eab308', construction: '#16a34a' },
  wallHeightDefaultM: 2.6,
};
