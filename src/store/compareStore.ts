import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type {
  AlignmentPointPair,
  AreaKind,
  AreaShape,
  Comparison,
  CompareToolMode,
  CompareViewMode,
  ComparisonPage,
  ExportRegion,
  LayerTransform,
  Markup,
  MarkupTool,
  Measurement,
  MeasureTool,
  RevisionLayer,
  RevisionPageData,
} from '../types/compare';
import { DEFAULT_AREA_KIND_COLORS, IDENTITY_TRANSFORM } from '../types/compare';
import type { Calibration, Point } from '../types';
import { saveComparison as dbSaveComparison } from '../db/database';

const REVISION_COLOR_PALETTE = ['#ef4444', '#2563eb', '#9333ea', '#f59e0b', '#16a34a', '#0891b2'];

export function createEmptyComparison(
  name: string,
  apartmentNumber: string,
  originalFileName: string,
  revisedFileNames: string[]
): Comparison {
  const now = Date.now();
  const revisions: RevisionLayer[] = revisedFileNames.map((fileName, i) => ({
    id: uuid(),
    label: revisedFileNames.length > 1 ? `מעודכן ${i + 1}` : 'מעודכן',
    fileName,
    opacity: 0.75,
    visible: true,
    colorTint: REVISION_COLOR_PALETTE[i % REVISION_COLOR_PALETTE.length],
    useSourceColors: false,
    markups: [],
    measurements: [],
  }));
  return {
    id: uuid(),
    name,
    apartmentNumber,
    notes: '',
    createdAt: now,
    updatedAt: now,
    originalFileName,
    originalOpacity: 1,
    originalVisible: true,
    originalColorTint: '#9ca3af',
    originalUseSourceColors: false,
    pages: {},
    revisions,
    activeRevisionId: revisions[0]?.id ?? '',
    areaKindColors: { ...DEFAULT_AREA_KIND_COLORS },
  };
}

/** Applies `updater` to the comparison's currently active revision, leaving the others untouched. */
function updateActiveRevision(comparison: Comparison, updater: (r: RevisionLayer) => RevisionLayer): RevisionLayer[] {
  return comparison.revisions.map((r) => (r.id === comparison.activeRevisionId ? updater(r) : r));
}

function emptyPage(originalPageNumber: number): ComparisonPage {
  return {
    originalPageNumber,
    originalCalibration: null,
    revisions: {},
  };
}

function emptyRevisionPageData(revisedPageNumber: number): RevisionPageData {
  return {
    revisedPageNumber,
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
  pendingAreaKind: AreaKind | null;
  areaShape: AreaShape;
  /** When on, each new polygon vertex snaps to a horizontal/vertical line from the previous one. */
  orthoSnap: boolean;

  markupTool: MarkupTool | null;
  markupPoints: Point[];
  markupColor: string;

  selectedMarkupId: string | null;
  selectedMeasurementId: string | null;

  exportRegion: ExportRegion | null;

  /** Manual show/hide toggle for finished markups & measurements — independent of which revision is active. */
  annotationsVisible: boolean;

  setComparison: (c: Comparison | null) => void;
  setCurrentPageKey: (n: number) => void;
  setOriginalNumPages: (n: number) => void;
  setRevisedNumPages: (n: number) => void;
  setToolMode: (m: CompareToolMode) => void;
  setViewMode: (m: CompareViewMode) => void;
  setSwipePosition: (v: number) => void;
  toggleAnnotationsVisible: () => void;
  toggleBlink: () => void;
  setExportRegion: (r: ExportRegion | null) => void;

  ensurePage: (pageKey: number) => ComparisonPage;
  updatePage: (pageKey: number, patch: Partial<ComparisonPage>) => void;
  updatePageQuiet: (pageKey: number, patch: Partial<ComparisonPage>) => void;
  updateActiveRevisionPage: (pageKey: number, patch: Partial<RevisionPageData>) => void;
  updateActiveRevisionPageQuiet: (pageKey: number, patch: Partial<RevisionPageData>) => void;

  setLayerOpacity: (layer: string, opacity: number) => void;
  setLayerVisible: (layer: string, visible: boolean) => void;
  setLayerTint: (layer: string, color: string) => void;
  setLayerSourceColors: (layer: string, useSource: boolean) => void;

  addRevision: (fileName: string) => string | null;
  removeRevision: (id: string) => void;
  renameRevision: (id: string, label: string) => void;
  setActiveRevisionId: (id: string) => void;

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
  setPendingAreaKind: (k: AreaKind | null) => void;
  setAreaShape: (s: AreaShape) => void;
  setOrthoSnap: (v: boolean) => void;
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

  setAreaKindColor: (kind: AreaKind, color: string) => void;

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
  pendingAreaKind: null,
  areaShape: 'polygon',
  orthoSnap: false,

  markupTool: null,
  markupPoints: [],
  markupColor: '#ef4444',

  selectedMarkupId: null,
  selectedMeasurementId: null,

  exportRegion: null,
  annotationsVisible: true,

  setComparison: (c) => set({ comparison: c, currentPageKey: 1, exportRegion: null, annotationsVisible: true }),
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
  toggleAnnotationsVisible: () => set((s) => ({ annotationsVisible: !s.annotationsVisible })),
  setExportRegion: (r) => set({ exportRegion: r }),

  ensurePage: (pageKey) => {
    const { comparison } = get();
    if (!comparison) throw new Error('No active comparison');
    const existing = comparison.pages[pageKey];
    if (existing) return existing;
    const created = emptyPage(pageKey);
    const pages = { ...comparison.pages, [pageKey]: created };
    set({ comparison: touch({ ...comparison, pages }) });
    return created;
  },

  updatePage: (pageKey, patch) => {
    const { comparison } = get();
    if (!comparison) return;
    const current = comparison.pages[pageKey] ?? emptyPage(pageKey);
    const pages = { ...comparison.pages, [pageKey]: { ...current, ...patch } };
    set({ comparison: touch({ ...comparison, pages }) });
    scheduleSave(get);
  },

  /** Like updatePage but skips the autosave schedule — for continuous drag updates. Caller persists explicitly when the drag ends. */
  updatePageQuiet: (pageKey: number, patch: Partial<ComparisonPage>) => {
    const { comparison } = get();
    if (!comparison) return;
    const current = comparison.pages[pageKey] ?? emptyPage(pageKey);
    const pages = { ...comparison.pages, [pageKey]: { ...current, ...patch } };
    set({ comparison: { ...comparison, pages } });
  },

  updateActiveRevisionPage: (pageKey, patch) => {
    const { comparison } = get();
    if (!comparison) return;
    const page = get().ensurePage(pageKey);
    const revisionId = comparison.activeRevisionId;
    if (!revisionId) return;
    const rp = page.revisions[revisionId] ?? emptyRevisionPageData(pageKey);
    get().updatePage(pageKey, { revisions: { ...page.revisions, [revisionId]: { ...rp, ...patch } } });
  },

  updateActiveRevisionPageQuiet: (pageKey, patch) => {
    const { comparison } = get();
    if (!comparison) return;
    const page = get().ensurePage(pageKey);
    const revisionId = comparison.activeRevisionId;
    if (!revisionId) return;
    const rp = page.revisions[revisionId] ?? emptyRevisionPageData(pageKey);
    get().updatePageQuiet(pageKey, { revisions: { ...page.revisions, [revisionId]: { ...rp, ...patch } } });
  },

  setLayerOpacity: (layer, opacity) => {
    const { comparison } = get();
    if (!comparison) return;
    if (layer === 'original') {
      set({ comparison: touch({ ...comparison, originalOpacity: opacity }) });
    } else {
      const revisions = comparison.revisions.map((r) => (r.id === layer ? { ...r, opacity } : r));
      set({ comparison: touch({ ...comparison, revisions }) });
    }
    scheduleSave(get);
  },
  setLayerVisible: (layer, visible) => {
    const { comparison } = get();
    if (!comparison) return;
    if (layer === 'original') {
      set({ comparison: touch({ ...comparison, originalVisible: visible }) });
    } else {
      const revisions = comparison.revisions.map((r) => (r.id === layer ? { ...r, visible } : r));
      set({ comparison: touch({ ...comparison, revisions }) });
    }
    scheduleSave(get);
  },
  setLayerTint: (layer, color) => {
    const { comparison } = get();
    if (!comparison) return;
    if (layer === 'original') {
      set({ comparison: touch({ ...comparison, originalColorTint: color }) });
    } else {
      const revisions = comparison.revisions.map((r) => (r.id === layer ? { ...r, colorTint: color } : r));
      set({ comparison: touch({ ...comparison, revisions }) });
    }
    scheduleSave(get);
  },
  setLayerSourceColors: (layer, useSource) => {
    const { comparison } = get();
    if (!comparison) return;
    if (layer === 'original') {
      set({ comparison: touch({ ...comparison, originalUseSourceColors: useSource }) });
    } else {
      const revisions = comparison.revisions.map((r) => (r.id === layer ? { ...r, useSourceColors: useSource } : r));
      set({ comparison: touch({ ...comparison, revisions }) });
    }
    scheduleSave(get);
  },

  addRevision: (fileName) => {
    const { comparison } = get();
    if (!comparison) return null;
    const id = uuid();
    const revision: RevisionLayer = {
      id,
      label: `מעודכן ${comparison.revisions.length + 1}`,
      fileName,
      opacity: 0.75,
      visible: true,
      colorTint: REVISION_COLOR_PALETTE[comparison.revisions.length % REVISION_COLOR_PALETTE.length],
      useSourceColors: false,
      markups: [],
      measurements: [],
    };
    set({
      comparison: touch({ ...comparison, revisions: [...comparison.revisions, revision], activeRevisionId: id }),
    });
    scheduleSave(get);
    return id;
  },
  removeRevision: (id) => {
    const { comparison } = get();
    if (!comparison || comparison.revisions.length <= 1) return;
    const revisions = comparison.revisions.filter((r) => r.id !== id);
    const pages = Object.fromEntries(
      Object.entries(comparison.pages).map(([key, p]) => {
        if (!(id in p.revisions)) return [key, p];
        const nextRevisions = { ...p.revisions };
        delete nextRevisions[id];
        return [key, { ...p, revisions: nextRevisions }];
      })
    );
    const activeRevisionId = comparison.activeRevisionId === id ? revisions[0].id : comparison.activeRevisionId;
    set({ comparison: touch({ ...comparison, revisions, pages, activeRevisionId }) });
    scheduleSave(get);
  },
  renameRevision: (id, label) => {
    const { comparison } = get();
    if (!comparison || !label.trim()) return;
    const revisions = comparison.revisions.map((r) => (r.id === id ? { ...r, label: label.trim() } : r));
    set({ comparison: touch({ ...comparison, revisions }) });
    scheduleSave(get);
  },
  setActiveRevisionId: (id) => {
    const { comparison } = get();
    if (!comparison) return;
    set({
      comparison: touch({ ...comparison, activeRevisionId: id }),
      calibrationPoints: [],
      calibrationLayer: null,
      alignmentPairs: [],
      alignmentPendingOriginal: null,
      pickingAlignmentPoints: false,
      measurePoints: [],
      markupPoints: [],
      selectedMarkupId: null,
      selectedMeasurementId: null,
    });
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
    if (calibrationLayer === 'original') {
      get().updatePage(currentPageKey, { originalCalibration: calibration });
    } else {
      get().updateActiveRevisionPage(currentPageKey, { revisedCalibration: calibration });
    }
    set({ calibrationPoints: [], calibrationLayer: null, toolMode: 'select' });
  },

  setAlignmentTransform: (pageKey, transform) => {
    get().updateActiveRevisionPage(pageKey, { alignment: transform });
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
      get().updateActiveRevisionPage(currentPageKey, { alignmentPoints: pairs });
    }
  },
  clearAlignmentPicking: () => set({ alignmentPairs: [], alignmentPendingOriginal: null }),
  clearAlignmentPoints: (pageKey) => {
    get().updateActiveRevisionPage(pageKey, { alignmentPoints: [], alignment: IDENTITY_TRANSFORM });
  },

  setMeasureTool: (t) => set({ toolMode: t ? 'measure' : 'select', measureTool: t, measurePoints: [] }),
  setPendingAreaKind: (k) => set({ pendingAreaKind: k }),
  setAreaShape: (s) => set({ areaShape: s, measurePoints: [] }),
  setOrthoSnap: (v) => set({ orthoSnap: v }),
  addMeasurePoint: (p) => set({ measurePoints: [...get().measurePoints, p] }),
  clearMeasurePoints: () => set({ measurePoints: [] }),
  finishMeasurement: (measurement) => {
    const { comparison } = get();
    if (!comparison) return;
    const revisions = updateActiveRevision(comparison, (r) => ({ ...r, measurements: [...r.measurements, measurement] }));
    set({ comparison: touch({ ...comparison, revisions }), measurePoints: [] });
    scheduleSave(get);
  },
  deleteMeasurement: (id) => {
    const { comparison } = get();
    if (!comparison) return;
    const revisions = updateActiveRevision(comparison, (r) => ({ ...r, measurements: r.measurements.filter((m) => m.id !== id) }));
    set({ comparison: touch({ ...comparison, revisions }) });
    scheduleSave(get);
  },

  setMarkupTool: (t) => set({ toolMode: t ? 'markup' : 'select', markupTool: t, markupPoints: [] }),
  setMarkupColor: (c) => set({ markupColor: c }),
  addMarkupPoint: (p) => set({ markupPoints: [...get().markupPoints, p] }),
  clearMarkupPoints: () => set({ markupPoints: [] }),
  finishMarkup: (markup) => {
    const { comparison } = get();
    if (!comparison) return;
    const revisions = updateActiveRevision(comparison, (r) => ({ ...r, markups: [...r.markups, markup] }));
    set({ comparison: touch({ ...comparison, revisions }), markupPoints: [] });
    scheduleSave(get);
  },
  updateMarkup: (id, patch) => {
    const { comparison } = get();
    if (!comparison) return;
    const revisions = updateActiveRevision(comparison, (r) => ({
      ...r,
      markups: r.markups.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
    set({ comparison: touch({ ...comparison, revisions }) });
    scheduleSave(get);
  },
  deleteMarkup: (id) => {
    const { comparison } = get();
    if (!comparison) return;
    const revisions = updateActiveRevision(comparison, (r) => ({ ...r, markups: r.markups.filter((m) => m.id !== id) }));
    set({ comparison: touch({ ...comparison, revisions }) });
    scheduleSave(get);
  },

  setAreaKindColor: (kind, color) => {
    const { comparison } = get();
    if (!comparison) return;
    set({ comparison: touch({ ...comparison, areaKindColors: { ...comparison.areaKindColors, [kind]: color } }) });
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
