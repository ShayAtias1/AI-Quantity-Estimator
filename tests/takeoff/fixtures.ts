// Deterministic plans for the takeoff safety tests: every work type, every opening type, waste and
// height overrides, an uncalibrated page, two apartments, and area/wall measurements.
import type { Markup, Measurement, Plan, Point, Room, WorkItem } from '../../src/types/index.ts';

const PAGE_H = 841.8898;
const toNative = (x: number, y: number): Point => ({ x, y: PAGE_H - y });
const rect = (a: Point, b: Point): Point[] => [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
/** The demo plan's 5.00 m reference line is 320 pt long. */
export const MPP = 5 / 320;
const T0 = 1_700_000_000_000;

function room(id: string, points: Point[], name: string, apartmentNumber: string, workItems: WorkItem[], extra: Partial<Room> = {}): Room {
  return { id, pageNumber: 1, points, closed: true, name, apartmentNumber, notes: '', workItems, color: '#2563eb', ...extra };
}

export const MEASUREMENTS: Measurement[] = [
  { id: 'm-distance', pageNumber: 1, tool: 'distance', points: [toNative(177.2, 120), toNative(463.9, 168.3)], label: "4.54 מ'" },
  { id: 'm-demolition-1', pageNumber: 1, tool: 'area', points: rect(toNative(980, 700), toNative(1100, 560)), label: '4.1 מ"ר', areaKind: 'demolition', areaM2: 4.1, calcMode: 'footprint' },
  { id: 'm-construction-1', pageNumber: 1, tool: 'area', points: rect(toNative(990, 500), toNative(1130, 489)), label: '5.69 מ"ר', areaKind: 'construction', areaM2: 5.69, calcMode: 'wall', wallLengthM: 2.19, wallHeightM: 2.6 },
  { id: 'm-demolition-2', pageNumber: 2, tool: 'area', points: rect(toNative(100, 100), toNative(200, 50)), label: '1.22 מ"ר', areaKind: 'demolition', areaM2: 1.22, calcMode: 'wall', wallLengthM: 0.47, wallHeightM: 2.6 },
  { id: 'm-demolition-3', pageNumber: 1, tool: 'area', points: rect(toNative(300, 100), toNative(400, 50)), label: '1.22 מ"ר', areaKind: 'demolition', areaM2: 1.22 },
  { id: 'm-plain', pageNumber: 1, tool: 'area', points: rect(toNative(990, 420), toNative(1080, 330)), label: '1.98 מ"ר', areaM2: 1.98 },
  { id: 'm-perimeter', pageNumber: 1, tool: 'perimeter', points: rect(toNative(600, 760), toNative(780, 640)), label: "7.5 מ'" },
];

const MARKUPS: Markup[] = [
  { id: 'n-1', pageNumber: 1, tool: 'text', points: [toNative(560, 820)], text: 'הערה', color: '#dc2626', createdAt: T0 },
];

export const PLAN_A: Plan = {
  id: 'plan-a',
  projectId: 'project-1',
  name: 'קומה 3',
  createdAt: T0,
  updatedAt: T0,
  pdfFileName: 'קומה-3.pdf',
  pages: {
    1: { pageNumber: 1, calibration: { pixelDistance: 320, realDistanceMeters: 5, metersPerPixel: MPP } },
    2: { pageNumber: 2, calibration: null },
  },
  rooms: [
    room('r-master', rect(toNative(135, 694.04), toNative(389.68, 490.52)), 'חדר הורים', '7', [
      { id: 'w1', type: 'tiling', tilingCategory: 'regular' },
      { id: 'w2', type: 'panels' },
      { id: 'w3', type: 'painting' },
    ], {
      openings: [
        { id: 'o1', type: 'door', widthM: 0.9, heightM: 2.1, quantity: 1 },
        { id: 'o2', type: 'window', widthM: 1.2, heightM: 1.2, quantity: 2 },
      ],
      notes: 'פרקט קיים',
      roomType: 'bedroom',
    }),
    room('r-bed1', rect(toNative(135, 480.28), toNative(325.68, 199.96)), 'חדר שינה', '7', [
      { id: 'w4', type: 'tiling', tilingCategory: 'regular', wastePercent: 7 },
      { id: 'w5', type: 'panels', heightM: 0.12, deductOpenings: false },
      { id: 'w6', type: 'plaster', heightM: 2.4 },
    ], {
      openings: [
        { id: 'o3', type: 'door', widthM: 0.8, heightM: 2.1, quantity: 1 },
        { id: 'o4', type: 'custom', widthM: 1, heightM: 1, quantity: 1 },
      ],
    }),
    room('r-living', rect(toNative(658.72, 531.48), toNative(949.04, 199.96)), 'סלון', '12', [
      { id: 'w7', type: 'tiling' },
      { id: 'w8', type: 'cladding', heightM: 1.2, wastePercent: 12 },
      { id: 'w9', type: 'panels', wastePercent: 0 },
      // A cleared waste field (NaN) falls back to the project default.
      { id: 'w9b', type: 'painting', wastePercent: Number.NaN, deductOpenings: false },
    ], {
      openings: [
        { id: 'o5', type: 'door', widthM: 0.9, heightM: 2.1, quantity: 2 },
        { id: 'o6', type: 'window', widthM: 2, heightM: 1.5, quantity: 1 },
      ],
      roomType: 'living',
    }),
    room('r-bath', [toNative(420, 470), toNative(600, 470), toNative(600, 330), toNative(520, 330), toNative(520, 260), toNative(420, 260)], 'חדר רחצה', '12', [
      { id: 'w10', type: 'tiling', tilingCategory: 'as' },
      { id: 'w11', type: 'cladding', heightM: 2.2 },
      { id: 'w12', type: 'waterproofing', heightM: 0.3, wastePercent: 3 },
      // Saved by a newer build: an unknown type counts as nothing.
      { id: 'w13', type: 'future_type' as WorkItem['type'] },
    ], {
      openings: [
        { id: 'o7', type: 'door', widthM: 0.7, heightM: 2.1, quantity: 1 },
        { id: 'o8', type: 'window', widthM: 0.6, heightM: 0.6, quantity: 1 },
      ],
      roomType: 'bath',
    }),
    // On page 2, which has no scale: quantities are not calculable, not zero.
    room('r-uncalibrated', rect(toNative(100, 300), toNative(300, 100)), 'מחסן', '12', [
      { id: 'w14', type: 'tiling' },
      { id: 'w15', type: 'panels' },
      { id: 'w16', type: 'plaster' },
    ], { pageNumber: 2 }),
  ],
  measurements: MEASUREMENTS,
  markups: MARKUPS,
  defaultCladdingHeightM: 2,
  defaultTilingWastePercent: 5,
  defaultTilingAsWastePercent: 9,
  defaultCladdingWastePercent: 8,
  defaultPanelsWastePercent: 10,
  defaultPlasterWastePercent: 4,
  areaKindColors: { demolition: '#eab308', construction: '#16a34a' },
  wallHeightDefaultM: 2.6,
};

/** An older plan: no panel height, AS waste or later-type defaults saved, so every fallback is used. */
export const PLAN_B: Plan = {
  id: 'plan-b',
  projectId: 'project-1',
  name: 'קומה 4',
  createdAt: T0,
  updatedAt: T0,
  pdfFileName: 'קומה-4.pdf',
  pages: { 1: { pageNumber: 1, calibration: { pixelDistance: 400, realDistanceMeters: 6.25, metersPerPixel: 6.25 / 400 } } },
  rooms: [
    room('r-b1', [toNative(100, 700), toNative(400, 700), toNative(400, 400), toNative(250, 300), toNative(100, 400)], 'חדר שינה', '14', [
      { id: 'wb1', type: 'tiling' },
      { id: 'wb2', type: 'panels' },
    ], { openings: [{ id: 'ob1', type: 'door', widthM: 0.9, heightM: 2.1, quantity: 1 }] }),
    room('r-b2', rect(toNative(500, 700), toNative(700, 500)), 'שירותים', '14', [
      { id: 'wb3', type: 'tiling', tilingCategory: 'as' },
      { id: 'wb4', type: 'cladding' },
      { id: 'wb5', type: 'waterproofing' },
    ]),
    room('r-b3', rect(toNative(750, 700), toNative(900, 600)), '', '', [{ id: 'wb6', type: 'tiling' }]),
  ],
  measurements: [],
  markups: [],
  defaultCladdingHeightM: 2.1,
  defaultTilingWastePercent: 6,
  defaultCladdingWastePercent: 8,
  defaultPanelsWastePercent: 10,
  areaKindColors: { demolition: '#eab308', construction: '#16a34a' },
  wallHeightDefaultM: 2.5,
};
