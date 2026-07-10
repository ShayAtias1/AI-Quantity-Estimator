import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type {
  AlignmentPointPair,
  Comparison,
  CompareToolMode,
  CompareViewMode,
  ComparisonPage,
  LayerTransform,
  Markup,
  MarkupTool,
  Measurement,
  MeasureTool,
} from '../types/compare';
import { IDENTITY_TRANSFORM } from '../types/compare';
import type { Calibration, Point } from '../types';
import { saveComparison as dbSaveComparison } from '../db/database';

export function createEmptyComparison(name: string, apartmentNumber: string, originalFileName: string, revisedFileName: string): Comparison {
  const now = Date.now();
  return {
    id: uuid(),
    name,
    apartmentNumber,
    notes: '',
    createdAt: now,
    updatedAt: now,
    originalFileName,
    revisedFileName,
    originalOpacity: 1,
    revisedOpacity: 0.75,
    originalVisible: true,
    revisedVisible: true,
    originalColorTint: '#9ca3af',
    revisedColorTint: '#ef4444',
    originalUseSourceColors: false,
    revisedUseSourceColors: false,
    pages: {},
    markups: [],
    measurements: [],
  };
}

function emptyPage(originalPageNumber: number, revisedPageNumber: number): ComparisonPage {
  return {
    originalPageNumber,
    revisedPageNumber,
    originalCalibration: null,
    revisedCalibration: null,
    alignment: IDENTITY_TRANSFORM,
    alignmentPoints: [],
  };
}

interface CompareState {
  comparison: Comparison | null;
  currentPageKey: number;
  originalNumPages: number;
  revisedNumPages: number;
  toolMode: CompareToolMode;
  viewMode: CompareViewMode;
  swipePosition: number; // 0-1, fraction of viewport width
  blinkShowingRevised: boolean;

  calibrationLayer: 'original' | 'revised' | null;
  calibrationPoints: Point[];

  alignmentPairs: AlignmentPointPair[];
  alignmentPendingOriginal: Point | null;
  pickingAlignmentPoints: boolean;

  measureTool: MeasureTool | null;
  measurePoints: Point[];

  markupTool: MarkupTool | null;
  markupPoints: Point[];
  markupColor: string;

  selectedMarkupId: string | null;
  selectedMeasurementId: string | null;

  setComparison: (c: Comparison | null) => void;
  setCurrentPageKey: (n: number) => void;
  setOriginalNumPages: (n: number) => void;
  setRevisedNumPages: (n: number) => void;
  setToolMode: (m: CompareToolMode) => void;
  setViewMode: (m: CompareViewMode) => void;
  setSwipePosition: (v: number) => void;
  toggleBlink: () => void;

  ensurePage: (pageKey: number) => ComparisonPage;
  updatePage: (pageKey: number, patch: Partial<ComparisonPage>) => void;
  updatePageQuiet: (pageKey: number, patch: Partial<ComparisonPage>) => void;

  setLayerOpacity: (layer: 'original' | 'revised', opacity: number) => void;
  setLayerVisible: (layer: 'original' | 'revised', visible: boolean) => void;
  setLayerTint: (layer: 'original' | 'revised', color: string) => void;
  setLayerSourceColors: (layer: 'original' | 'revised', useSource: boolean) => void;

  startCalibration: (layer: 'original' | 'revised') => void;
  addCalibrationPoint: (p: Point) => void;
  clearCalibration: () => void;
  applyCalibration: (realDistanceMeters: number) => void;

  setAlignmentTransform: (pageKey: number, transform: LayerTransform) => void;
  beginAlignmentPointPick: () => void;
  addAlignmentPoint: (p: Point, isOriginal: boolean) => void;
  clearAlignmentPicking: () => void;
  clearAlignmentPoints: (pageKey: number) => void;

  setMeasureTool: (t: MeasureTool | null) => void;
  addMeasurePoint: (p: Point) => void;
  clearMeasurePoints: () => void;
  finishMeasurement: (measurement: Measurement) => void;
  deleteMeasurement: (id: string) => void;

  setMarkupTool: (t: MarkupTool | null) => void;
  setMarkupColor: (c: string) => void;
  addMarkupPoint: (p: Point) => void;
  clearMarkupPoints: () => void;
  finishMarkup: (markup: Markup) => void;
  updateMarkup: (id: string, patch: Partial<Markup>) => void;
  deleteMarkup: (id: string) => void;

  updateComparisonMeta: (patch: Partial<Pick<Comparison, 'name' | 'apartmentNumber' | 'notes'>>) => void;

  persist: () => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(get: () => CompareState) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void get().persist();
  }, 800);
}

function touch(comparison: Comparison): Comparison {
  return { ...comparison, updatedAt: Date.now() };
}

export const useCompareStore = create<CompareState>((set, get) => ({
  comparison: null,
  currentPageKey: 1,
  originalNumPages: 1,
  revisedNumPages: 1,
  toolMode: 'select',
  viewMode: 'overlay',
  swipePosition: 0.5,
  blinkShowingRevised: true,

  calibrationLayer: null,
  calibrationPoints: [],

  alignmentPairs: [],
  alignmentPendingOriginal: null,
  pickingAlignmentPoints: false,

  measureTool: null,
  measurePoints: [],

  markupTool: null,
  markupPoints: [],
  markupColor: '#ef4444',

  selectedMarkupId: null,
  selectedMeasurementId: null,

  setComparison: (c) => set({ comparison: c, currentPageKey: 1 }),
  setCurrentPageKey: (n) => set({ currentPageKey: n }),
  setOriginalNumPages: (n) => set({ originalNumPages: n }),
  setRevisedNumPages: (n) => set({ revisedNumPages: n }),
  setToolMode: (m) =>
    set({
      toolMode: m,
      calibrationPoints: [],
      calibrationLayer: null,
      alignmentPairs: [],
      alignmentPendingOriginal: null,
      pickingAlignmentPoints: false,
      measurePoints: [],
      markupPoints: [],
    }),
  setViewMode: (m) => set({ viewMode: m }),
  setSwipePosition: (v) => set({ swipePosition: Math.min(1, Math.max(0, v)) }),
  toggleBlink: () => set((s) => ({ blinkShowingRevised: !s.blinkShowingRevised })),

  ensurePage: (pageKey) => {
    const { comparison } = get();
    if (!comparison) throw new Error('No active comparison');
    const existing = comparison.pages[pageKey];
    if (existing) return existing;
    const created = emptyPage(pageKey, pageKey);
    const pages = { ...comparison.pages, [pageKey]: created };
    set({ comparison: touch({ ...comparison, pages }) });
    return created;
  },

  updatePage: (pageKey, patch) => {
    const { comparison } = get();
    if (!comparison) return;
    const current = comparison.pages[pageKey] ?? emptyPage(pageKey, pageKey);
    const pages = { ...comparison.pages, [pageKey]: { ...current, ...patch } };
    set({ comparison: touch({ ...comparison, pages }) });
    scheduleSave(get);
  },

  /** Like updatePage but skips the autosave schedule — for continuous drag updates. Caller persists explicitly when the drag ends. */
  updatePageQuiet: (pageKey: number, patch: Partial<ComparisonPage>) => {
    const { comparison } = get();
    if (!comparison) return;
    const current = comparison.pages[pageKey] ?? emptyPage(pageKey, pageKey);
    const pages = { ...comparison.pages, [pageKey]: { ...current, ...patch } };
    set({ comparison: { ...comparison, pages } });
  },

  setLayerOpacity: (layer, opacity) => {
    const { comparison } = get();
    if (!comparison) return;
    const patch = layer === 'original' ? { originalOpacity: opacity } : { revisedOpacity: opacity };
    set({ comparison: touch({ ...comparison, ...patch }) });
    scheduleSave(get);
  },
  setLayerVisible: (layer, visible) => {
    const { comparison } = get();
    if (!comparison) return;
    const patch = layer === 'original' ? { originalVisible: visible } : { revisedVisible: visible };
    set({ comparison: touch({ ...comparison, ...patch }) });
    scheduleSave(get);
  },
  setLayerTint: (layer, color) => {
    const { comparison } = get();
    if (!comparison) return;
    const patch = layer === 'original' ? { originalColorTint: color } : { revisedColorTint: color };
    set({ comparison: touch({ ...comparison, ...patch }) });
    scheduleSave(get);
  },
  setLayerSourceColors: (layer, useSource) => {
    const { comparison } = get();
    if (!comparison) return;
    const patch = layer === 'original' ? { originalUseSourceColors: useSource } : { revisedUseSourceColors: useSource };
    set({ comparison: touch({ ...comparison, ...patch }) });
    scheduleSave(get);
  },

  startCalibration: (layer) => set({ toolMode: 'calibrate', calibrationLayer: layer, calibrationPoints: [] }),
  addCalibrationPoint: (p) => {
    const pts = [...get().calibrationPoints, p];
    set({ calibrationPoints: pts.slice(-2) });
  },
  clearCalibration: () => set({ calibrationPoints: [], calibrationLayer: null }),
  applyCalibration: (realDistanceMeters) => {
    const { calibrationPoints, calibrationLayer, currentPageKey } = get();
    if (calibrationPoints.length !== 2 || !calibrationLayer || realDistanceMeters <= 0) return;
    const [a, b] = calibrationPoints;
    const pixelDistance = Math.hypot(b.x - a.x, b.y - a.y);
    if (pixelDistance === 0) return;
    const calibration: Calibration = { pixelDistance, realDistanceMeters, metersPerPixel: realDistanceMeters / pixelDistance };
    const page = get().ensurePage(currentPageKey);
    const patch: Partial<ComparisonPage> =
      calibrationLayer === 'original' ? { originalCalibration: calibration } : { revisedCalibration: calibration };
    get().updatePage(currentPageKey, { ...page, ...patch });
    set({ calibrationPoints: [], calibrationLayer: null, toolMode: 'select' });
  },

  setAlignmentTransform: (pageKey, transform) => {
    get().updatePage(pageKey, { alignment: transform });
  },
  beginAlignmentPointPick: () =>
    set({ toolMode: 'align', pickingAlignmentPoints: true, alignmentPairs: [], alignmentPendingOriginal: null }),
  addAlignmentPoint: (p, isOriginal) => {
    const { alignmentPendingOriginal, alignmentPairs, currentPageKey, pickingAlignmentPoints } = get();
    if (!pickingAlignmentPoints) return;
    if (isOriginal) {
      set({ alignmentPendingOriginal: p });
      return;
    }
    if (!alignmentPendingOriginal) return;
    const pairs = [...alignmentPairs, { originalPoint: alignmentPendingOriginal, revisedPoint: p }].slice(-2);
    const donePicking = pairs.length === 2;
    set({ alignmentPairs: pairs, alignmentPendingOriginal: null, pickingAlignmentPoints: !donePicking });
    if (donePicking) {
      const page = get().ensurePage(currentPageKey);
      get().updatePage(currentPageKey, { ...page, alignmentPoints: pairs });
    }
  },
  clearAlignmentPicking: () => set({ alignmentPairs: [], alignmentPendingOriginal: null }),
  clearAlignmentPoints: (pageKey) => {
    get().updatePage(pageKey, { alignmentPoints: [], alignment: IDENTITY_TRANSFORM });
  },

  setMeasureTool: (t) => set({ toolMode: t ? 'measure' : 'select', measureTool: t, measurePoints: [] }),
  addMeasurePoint: (p) => set({ measurePoints: [...get().measurePoints, p] }),
  clearMeasurePoints: () => set({ measurePoints: [] }),
  finishMeasurement: (measurement) => {
    const { comparison } = get();
    if (!comparison) return;
    set({ comparison: touch({ ...comparison, measurements: [...comparison.measurements, measurement] }), measurePoints: [] });
    scheduleSave(get);
  },
  deleteMeasurement: (id) => {
    const { comparison } = get();
    if (!comparison) return;
    set({ comparison: touch({ ...comparison, measurements: comparison.measurements.filter((m) => m.id !== id) }) });
    scheduleSave(get);
  },

  setMarkupTool: (t) => set({ toolMode: t ? 'markup' : 'select', markupTool: t, markupPoints: [] }),
  setMarkupColor: (c) => set({ markupColor: c }),
  addMarkupPoint: (p) => set({ markupPoints: [...get().markupPoints, p] }),
  clearMarkupPoints: () => set({ markupPoints: [] }),
  finishMarkup: (markup) => {
    const { comparison } = get();
    if (!comparison) return;
    set({ comparison: touch({ ...comparison, markups: [...comparison.markups, markup] }), markupPoints: [] });
    scheduleSave(get);
  },
  updateMarkup: (id, patch) => {
    const { comparison } = get();
    if (!comparison) return;
    const markups = comparison.markups.map((m) => (m.id === id ? { ...m, ...patch } : m));
    set({ comparison: touch({ ...comparison, markups }) });
    scheduleSave(get);
  },
  deleteMarkup: (id) => {
    const { comparison } = get();
    if (!comparison) return;
    set({ comparison: touch({ ...comparison, markups: comparison.markups.filter((m) => m.id !== id) }) });
    scheduleSave(get);
  },

  updateComparisonMeta: (patch) => {
    const { comparison } = get();
    if (!comparison) return;
    set({ comparison: touch({ ...comparison, ...patch }) });
    scheduleSave(get);
  },

  persist: async () => {
    const { comparison } = get();
    if (!comparison) return;
    await dbSaveComparison(comparison);
  },
}));
