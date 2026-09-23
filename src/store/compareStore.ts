import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type {
  AlignmentPointPair,
  AreaCalcMode,
  AreaKind,
  AreaShape,
  CompareCalibration,
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
import type { Point } from '../types';
import { saveComparison as dbSaveComparison } from '../db/database';
import { createHistoryTracker } from '../lib/undoHistory';
import { resolveAlignmentStatus, resolveCompareScale, type AlignmentStatus, type ResolvedScale } from '../lib/compareScale';

const historyTracker = createHistoryTracker<Comparison>();

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
    wallHeightDefaultM: 2.5,
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
  areaCalcMode: AreaCalcMode;
  /** When on, each new polygon vertex snaps to a horizontal/vertical line from the previous one. */
  orthoSnap: boolean;

  markupTool: MarkupTool | null;
  markupPoints: Point[];
  markupColor: string;
  /** When on, markup lines (dimension/arrow/cloud) snap to horizontal/vertical from the previous point. */
  markupOrtho: boolean;

  selectedMarkupId: string | null;
  selectedMeasurementId: string | null;

  /** Chosen PDF-export crop per page key (original layer's native px). Session state, like the takeoff side. */
  exportRegions: Record<number, ExportRegion>;

  /** Bottom "שינויים" panel: session UI state only, never persisted with the comparison. */
  changesOpen: boolean;
  changesHeight: number;
  changesMaximized: boolean;
  /** Whether the changes table lists the whole revision or only the source page on screen. */
  changesScope: 'all' | 'page';
  setChangesOpen: (open: boolean) => void;
  setChangesHeight: (px: number) => void;
  toggleChangesMaximized: () => void;
  setChangesScope: (scope: 'all' | 'page') => void;

  /** Manual show/hide toggle for finished markups — independent of which revision is active. */
  annotationsVisible: boolean;
  /** Manual show/hide toggle for finished measurements — independent of the markups toggle. */
  measurementsVisible: boolean;

  /** True from the moment a mutation happens until the next successful persist. */
  dirty: boolean;
  /** True while a persist is in flight. */
  saving: boolean;
  /** Message of the last failed persist, cleared on the next successful one. */
  saveError: string | null;

  /** Undo/redo stacks of past/future comparison snapshots. Not persisted — reset whenever the comparison changes. */
  history: Comparison[];
  future: Comparison[];
  undo: () => void;
  redo: () => void;

  setComparison: (c: Comparison | null) => void;
  setCurrentPageKey: (n: number) => void;
  setOriginalNumPages: (n: number) => void;
  setRevisedNumPages: (n: number) => void;
  setToolMode: (m: CompareToolMode) => void;
  setViewMode: (m: CompareViewMode) => void;
  setSwipePosition: (v: number) => void;
  toggleAnnotationsVisible: () => void;
  toggleMeasurementsVisible: () => void;
  toggleBlink: () => void;
  setExportRegion: (pageKey: number, r: ExportRegion | null) => void;

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
  /**
   * Moves a revision one slot up/down in `comparison.revisions`. That array's order is the display
   * order (layer panel, revision tabs) and the order the all-revisions export walks, and it is part
   * of the comparison, so the new order is persisted like any other edit.
   */
  moveRevision: (id: string, direction: -1 | 1) => void;

  startCalibration: (layer: 'original' | 'revised') => void;
  addCalibrationPoint: (p: Point) => void;
  clearCalibration: () => void;
  applyCalibration: (realDistanceMeters: number) => void;

  /** `method` records how the transform was produced; it defaults to a manual adjustment. */
  setAlignmentTransform: (pageKey: number, transform: LayerTransform, method?: 'points' | 'manual') => void;
  /** Maps the given source page to a page of the active revision's PDF. */
  setRevisedPageNumber: (pageKey: number, revisedPageNumber: number) => void;
  beginAlignmentPointPick: () => void;
  addAlignmentPoint: (p: Point, isOriginal: boolean) => void;
  clearAlignmentPicking: () => void;
  clearAlignmentPoints: (pageKey: number) => void;

  setMeasureTool: (t: MeasureTool | null) => void;
  setPendingAreaKind: (k: AreaKind | null) => void;
  /** Arms the area tool already classified as demolition / new construction. */
  startChangeMeasurement: (kind: AreaKind) => void;
  /** Reclassifies an existing change item without touching its geometry or quantities. */
  setMeasurementKind: (id: string, kind: AreaKind) => void;
  setSelectedMeasurementId: (id: string | null) => void;
  /** Selects a measurement, switching to the source page that owns it when necessary. */
  focusMeasurement: (id: string) => void;
  setAreaShape: (s: AreaShape) => void;
  setAreaCalcMode: (m: AreaCalcMode) => void;
  setOrthoSnap: (v: boolean) => void;
  addMeasurePoint: (p: Point) => void;
  clearMeasurePoints: () => void;
  /** Page ownership is assigned by the store from the page on screen, not by the caller. */
  finishMeasurement: (measurement: Omit<Measurement, 'pageNumber'>) => void;
  updateMeasurement: (id: string, patch: Partial<Measurement>) => void;
  deleteMeasurement: (id: string) => void;

  setMarkupTool: (t: MarkupTool | null) => void;
  setMarkupColor: (c: string) => void;
  setMarkupOrtho: (v: boolean) => void;
  /** Label size multiplier applied to newly created text notes / dimension labels. */
  markupFontScale: number;
  setMarkupFontScale: (v: number) => void;
  addMarkupPoint: (p: Point) => void;
  clearMarkupPoints: () => void;
  /** Page ownership is assigned by the store from the page on screen, not by the caller. */
  finishMarkup: (markup: Omit<Markup, 'pageNumber'>) => void;
  updateMarkup: (id: string, patch: Partial<Markup>) => void;
  /** Like updateMarkup but skips the autosave schedule — for continuous drag updates. */
  updateMarkupQuiet: (id: string, patch: Partial<Markup>) => void;
  deleteMarkup: (id: string) => void;
  duplicateMarkup: (id: string) => void;
  setSelectedMarkupId: (id: string | null) => void;

  setAreaKindColor: (kind: AreaKind, color: string) => void;

  updateComparisonMeta: (patch: Partial<Pick<Comparison, 'name' | 'apartmentNumber' | 'notes' | 'wallHeightDefaultM'>>) => void;

  persist: () => Promise<void>;
}

/**
 * Marks the comparison as carrying unsaved work. Every mutation path goes through here: the normal
 * autosave route below, and the `*Quiet` variants that persist only when a drag ends.
 */
function markDirty(set: (patch: Partial<CompareState>) => void) {
  set({ dirty: true });
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(get: () => CompareState, set: (patch: Partial<CompareState>) => void) {
  markDirty(set);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void get().persist();
  }, 800);
}

export type CompareSaveState = 'saving' | 'saved' | 'unsaved' | 'error';

/** Save state for the UI, derived from the flags above — `useCompareStore(selectCompareSaveState)`. */
export function selectCompareSaveState(s: CompareState): CompareSaveState {
  if (!s.comparison) return 'saved';
  if (s.saving) return 'saving';
  if (s.saveError) return 'error';
  return s.dirty ? 'unsaved' : 'saved';
}

/**
 * The active revision's record for a source page, if it has one yet. Plain helpers rather than
 * zustand selectors: they build fresh objects, which a `useStore` selector must never do.
 */
export function revisionPageOf(comparison: Comparison | null, pageKey: number): RevisionPageData | undefined {
  if (!comparison) return undefined;
  return comparison.pages[pageKey]?.revisions[comparison.activeRevisionId];
}

/**
 * The real-world scale in use for measurements on a page/active-revision pair — the single source
 * of truth for both the canvas math and the UI's calibration status.
 */
export function compareScaleFor(comparison: Comparison | null, pageKey: number): ResolvedScale {
  return resolveCompareScale(comparison?.pages[pageKey], revisionPageOf(comparison, pageKey));
}

/** Alignment state of a page/active-revision pair. */
export function alignmentStatusFor(comparison: Comparison | null, pageKey: number): AlignmentStatus {
  return resolveAlignmentStatus(revisionPageOf(comparison, pageKey));
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
  areaCalcMode: 'footprint',
  orthoSnap: false,

  markupTool: null,
  markupPoints: [],
  markupColor: '#ef4444',
  markupOrtho: false,
  markupFontScale: 1,

  selectedMarkupId: null,
  selectedMeasurementId: null,

  exportRegions: {},
  changesOpen: false,
  changesHeight: 300,
  changesMaximized: false,
  changesScope: 'all',
  annotationsVisible: true,
  measurementsVisible: true,
  dirty: false,
  saving: false,
  saveError: null,
  history: [],
  future: [],

  setComparison: (c) => {
    historyTracker.discard();
    set({
      comparison: c,
      currentPageKey: 1,
      exportRegions: {},
      dirty: false,
      saveError: null,
      annotationsVisible: true,
      measurementsVisible: true,
      selectedMarkupId: null,
      selectedMeasurementId: null,
      history: [],
      future: [],
    });
  },
  undo: () => {
    historyTracker.flush(get, set);
    const { comparison, history, future } = get();
    if (!comparison || history.length === 0) return;
    const previous = history[history.length - 1];
    set({
      comparison: previous,
      history: history.slice(0, -1),
      future: [comparison, ...future],
      selectedMarkupId: null,
      selectedMeasurementId: null,
    });
    scheduleSave(get, set);
  },
  redo: () => {
    // Consistent with undo: a mutation still inside the history debounce is recorded first,
    // otherwise redo would restore a future snapshot on top of an un-snapshotted change.
    historyTracker.flush(get, set);
    const { comparison, history, future } = get();
    if (!comparison || future.length === 0) return;
    const next = future[0];
    set({
      comparison: next,
      history: [...history, comparison],
      future: future.slice(1),
      selectedMarkupId: null,
      selectedMeasurementId: null,
    });
    scheduleSave(get, set);
  },
  setCurrentPageKey: (n) =>
    set({
      currentPageKey: n,
      // Same reset as switching tools/revisions: nothing half-drawn carries across pages.
      calibrationPoints: [],
      calibrationLayer: null,
      alignmentPairs: [],
      alignmentPendingOriginal: null,
      pickingAlignmentPoints: false,
      measurePoints: [],
      markupPoints: [],
      selectedMarkupId: null,
      selectedMeasurementId: null,
    }),
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
      selectedMarkupId: null,
    }),
  setViewMode: (m) => set({ viewMode: m }),
  setSwipePosition: (v) => set({ swipePosition: Math.min(1, Math.max(0, v)) }),
  toggleBlink: () => set((s) => ({ blinkShowingRevised: !s.blinkShowingRevised })),
  toggleAnnotationsVisible: () => set((s) => ({ annotationsVisible: !s.annotationsVisible })),
  toggleMeasurementsVisible: () => set((s) => ({ measurementsVisible: !s.measurementsVisible })),
  setChangesOpen: (open) => set({ changesOpen: open, ...(open ? {} : { changesMaximized: false }) }),
  setChangesHeight: (px) => set({ changesHeight: px }),
  toggleChangesMaximized: () => set((s) => ({ changesMaximized: !s.changesMaximized })),
  setChangesScope: (scope) => set({ changesScope: scope }),
  setExportRegion: (pageKey, r) =>
    set((state) => {
      // Per page: a crop chosen on page 2 must not follow the user to page 5.
      const next = { ...state.exportRegions };
      if (r) next[pageKey] = r;
      else delete next[pageKey];
      return { exportRegions: next };
    }),

  ensurePage: (pageKey) => {
    const { comparison } = get();
    if (!comparison) throw new Error('No active comparison');
    const existing = comparison.pages[pageKey];
    if (existing) return existing;
    const created = emptyPage(pageKey);
    const pages = { ...comparison.pages, [pageKey]: created };
    set({ comparison: touch({ ...comparison, pages }) });
    markDirty(set);
    return created;
  },

  updatePage: (pageKey, patch) => {
    const { comparison } = get();
    if (!comparison) return;
    const current = comparison.pages[pageKey] ?? emptyPage(pageKey);
    const pages = { ...comparison.pages, [pageKey]: { ...current, ...patch } };
    set({ comparison: touch({ ...comparison, pages }) });
    scheduleSave(get, set);
  },

  /** Like updatePage but skips the autosave schedule — for continuous drag updates. Caller persists explicitly when the drag ends. */
  updatePageQuiet: (pageKey: number, patch: Partial<ComparisonPage>) => {
    const { comparison } = get();
    if (!comparison) return;
    historyTracker.pushDebounced(get, set, comparison);
    const current = comparison.pages[pageKey] ?? emptyPage(pageKey);
    const pages = { ...comparison.pages, [pageKey]: { ...current, ...patch } };
    set({ comparison: { ...comparison, pages } });
    markDirty(set);
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
    historyTracker.pushDebounced(get, set, comparison);
    if (layer === 'original') {
      set({ comparison: touch({ ...comparison, originalOpacity: opacity }) });
    } else {
      const revisions = comparison.revisions.map((r) => (r.id === layer ? { ...r, opacity } : r));
      set({ comparison: touch({ ...comparison, revisions }) });
    }
    scheduleSave(get, set);
  },
  setLayerVisible: (layer, visible) => {
    const { comparison } = get();
    if (!comparison) return;
    historyTracker.push(get, set, comparison);
    if (layer === 'original') {
      set({ comparison: touch({ ...comparison, originalVisible: visible }) });
    } else {
      const revisions = comparison.revisions.map((r) => (r.id === layer ? { ...r, visible } : r));
      set({ comparison: touch({ ...comparison, revisions }) });
    }
    scheduleSave(get, set);
  },
  setLayerTint: (layer, color) => {
    const { comparison } = get();
    if (!comparison) return;
    historyTracker.push(get, set, comparison);
    if (layer === 'original') {
      set({ comparison: touch({ ...comparison, originalColorTint: color }) });
    } else {
      const revisions = comparison.revisions.map((r) => (r.id === layer ? { ...r, colorTint: color } : r));
      set({ comparison: touch({ ...comparison, revisions }) });
    }
    scheduleSave(get, set);
  },
  setLayerSourceColors: (layer, useSource) => {
    const { comparison } = get();
    if (!comparison) return;
    historyTracker.push(get, set, comparison);
    if (layer === 'original') {
      set({ comparison: touch({ ...comparison, originalUseSourceColors: useSource }) });
    } else {
      const revisions = comparison.revisions.map((r) => (r.id === layer ? { ...r, useSourceColors: useSource } : r));
      set({ comparison: touch({ ...comparison, revisions }) });
    }
    scheduleSave(get, set);
  },

  addRevision: (fileName) => {
    const { comparison } = get();
    if (!comparison) return null;
    historyTracker.push(get, set, comparison);
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
    scheduleSave(get, set);
    return id;
  },
  removeRevision: (id) => {
    const { comparison } = get();
    if (!comparison) return;
    historyTracker.push(get, set, comparison);
    const revisions = comparison.revisions.filter((r) => r.id !== id);
    const pages = Object.fromEntries(
      Object.entries(comparison.pages).map(([key, p]) => {
        if (!(id in p.revisions)) return [key, p];
        const nextRevisions = { ...p.revisions };
        delete nextRevisions[id];
        return [key, { ...p, revisions: nextRevisions }];
      })
    );
    const activeRevisionId = comparison.activeRevisionId === id ? revisions[0]?.id ?? '' : comparison.activeRevisionId;
    set({ comparison: touch({ ...comparison, revisions, pages, activeRevisionId }) });
    scheduleSave(get, set);
  },
  renameRevision: (id, label) => {
    const { comparison } = get();
    if (!comparison || !label.trim()) return;
    historyTracker.push(get, set, comparison);
    const revisions = comparison.revisions.map((r) => (r.id === id ? { ...r, label: label.trim() } : r));
    set({ comparison: touch({ ...comparison, revisions }) });
    scheduleSave(get, set);
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
    scheduleSave(get, set);
  },

  moveRevision: (id, direction) => {
    const { comparison } = get();
    if (!comparison) return;
    const index = comparison.revisions.findIndex((r) => r.id === id);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= comparison.revisions.length) return;
    historyTracker.push(get, set, comparison);
    const revisions = [...comparison.revisions];
    [revisions[index], revisions[target]] = [revisions[target], revisions[index]];
    set({ comparison: touch({ ...comparison, revisions }) });
    scheduleSave(get, set);
  },

  startCalibration: (layer) => set({ toolMode: 'calibrate', calibrationLayer: layer, calibrationPoints: [] }),
  addCalibrationPoint: (p) => {
    const pts = [...get().calibrationPoints, p];
    set({ calibrationPoints: pts.slice(-2) });
  },
  clearCalibration: () => set({ calibrationPoints: [], calibrationLayer: null }),
  applyCalibration: (realDistanceMeters) => {
    const { comparison, calibrationPoints, calibrationLayer, currentPageKey } = get();
    if (!comparison || calibrationPoints.length !== 2 || !calibrationLayer || realDistanceMeters <= 0) return;
    const [a, b] = calibrationPoints;
    // The clicked points are always in the source page's native px — the overlay is drawn in that
    // space whichever layer the user is looking at.
    const sourcePixelDistance = Math.hypot(b.x - a.x, b.y - a.y);
    if (sourcePixelDistance === 0) return;
    historyTracker.push(get, set, comparison);
    if (calibrationLayer === 'original') {
      const calibration: CompareCalibration = {
        pixelDistance: sourcePixelDistance,
        realDistanceMeters,
        metersPerPixel: realDistanceMeters / sourcePixelDistance,
        space: 'original',
      };
      get().updatePage(currentPageKey, { originalCalibration: calibration });
    } else {
      // Store the revised layer's calibration in the revised PDF's *own* px, so it survives any
      // later re-alignment: `alignment` is a similarity transform, so one revised px spans
      // `alignment.scale` source px whatever the rotation or offset is.
      const alignmentScale =
        comparison.pages[currentPageKey]?.revisions[comparison.activeRevisionId]?.alignment.scale ?? 1;
      if (!(alignmentScale > 0)) return;
      const pixelDistance = sourcePixelDistance / alignmentScale;
      const calibration: CompareCalibration = {
        pixelDistance,
        realDistanceMeters,
        metersPerPixel: realDistanceMeters / pixelDistance,
        space: 'revised',
      };
      get().updateActiveRevisionPage(currentPageKey, { revisedCalibration: calibration });
    }
    set({ calibrationPoints: [], calibrationLayer: null, toolMode: 'select' });
  },

  setAlignmentTransform: (pageKey, transform, method = 'manual') => {
    const { comparison } = get();
    if (comparison) historyTracker.pushDebounced(get, set, comparison);
    get().updateActiveRevisionPage(pageKey, { alignment: transform, alignmentMethod: method });
  },
  setRevisedPageNumber: (pageKey, revisedPageNumber) => {
    const { comparison } = get();
    if (!comparison || !Number.isFinite(revisedPageNumber)) return;
    historyTracker.push(get, set, comparison);
    get().updateActiveRevisionPage(pageKey, { revisedPageNumber: Math.max(1, Math.round(revisedPageNumber)) });
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
      const { comparison } = get();
      if (comparison) historyTracker.push(get, set, comparison);
      get().updateActiveRevisionPage(currentPageKey, { alignmentPoints: pairs });
    }
  },
  clearAlignmentPicking: () => set({ alignmentPairs: [], alignmentPendingOriginal: null }),
  clearAlignmentPoints: (pageKey) => {
    const { comparison } = get();
    if (comparison) historyTracker.push(get, set, comparison);
    get().updateActiveRevisionPage(pageKey, { alignmentPoints: [], alignment: IDENTITY_TRANSFORM, alignmentMethod: undefined });
    set({ alignmentPairs: [], alignmentPendingOriginal: null });
  },

  setMeasureTool: (t) => set({ toolMode: t ? 'measure' : 'select', measureTool: t, measurePoints: [], pendingAreaKind: null }),
  setPendingAreaKind: (k) => set({ pendingAreaKind: k }),
  startChangeMeasurement: (kind) => set({ toolMode: 'measure', measureTool: 'area', pendingAreaKind: kind, measurePoints: [] }),
  setMeasurementKind: (id, kind) => {
    const { comparison } = get();
    if (!comparison) return;
    historyTracker.push(get, set, comparison);
    const revisions = updateActiveRevision(comparison, (r) => ({
      ...r,
      measurements: r.measurements.map((m) => (m.id === id ? { ...m, areaKind: kind } : m)),
    }));
    set({ comparison: touch({ ...comparison, revisions }) });
    scheduleSave(get, set);
  },
  setSelectedMeasurementId: (id) => set({ selectedMeasurementId: id }),
  focusMeasurement: (id) => {
    const { comparison, currentPageKey } = get();
    if (!comparison) return;
    const active = comparison.revisions.find((r) => r.id === comparison.activeRevisionId);
    const target = active?.measurements.find((m) => m.id === id);
    if (!target) return;
    // Changing page clears in-progress state and the selection, so select afterwards.
    if (target.pageNumber !== currentPageKey) get().setCurrentPageKey(target.pageNumber);
    set({ selectedMeasurementId: id });
  },
  setAreaShape: (s) => set({ areaShape: s, measurePoints: [] }),
  setAreaCalcMode: (m) => set({ areaCalcMode: m, measurePoints: [] }),
  setOrthoSnap: (v) => set({ orthoSnap: v }),
  addMeasurePoint: (p) => set({ measurePoints: [...get().measurePoints, p] }),
  clearMeasurePoints: () => set({ measurePoints: [] }),
  finishMeasurement: (measurement) => {
    const { comparison, currentPageKey } = get();
    if (!comparison) return;
    historyTracker.push(get, set, comparison);
    // Page ownership is assigned here, not by the caller, so nothing can be stored page-less.
    const owned: Measurement = { ...measurement, pageNumber: currentPageKey };
    const revisions = updateActiveRevision(comparison, (r) => ({ ...r, measurements: [...r.measurements, owned] }));
    set({ comparison: touch({ ...comparison, revisions }), measurePoints: [] });
    scheduleSave(get, set);
  },
  updateMeasurement: (id, patch) => {
    const { comparison } = get();
    if (!comparison) return;
    historyTracker.pushDebounced(get, set, comparison);
    const revisions = updateActiveRevision(comparison, (r) => ({
      ...r,
      measurements: r.measurements.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
    set({ comparison: touch({ ...comparison, revisions }) });
    scheduleSave(get, set);
  },
  deleteMeasurement: (id) => {
    const { comparison } = get();
    if (!comparison) return;
    historyTracker.push(get, set, comparison);
    const revisions = updateActiveRevision(comparison, (r) => ({ ...r, measurements: r.measurements.filter((m) => m.id !== id) }));
    set({
      comparison: touch({ ...comparison, revisions }),
      selectedMeasurementId: get().selectedMeasurementId === id ? null : get().selectedMeasurementId,
    });
    scheduleSave(get, set);
  },

  setMarkupTool: (t) => set({ toolMode: t ? 'markup' : 'select', markupTool: t, markupPoints: [] }),
  setMarkupColor: (c) => set({ markupColor: c }),
  setMarkupOrtho: (v) => set({ markupOrtho: v }),
  setMarkupFontScale: (v) => set({ markupFontScale: v }),
  addMarkupPoint: (p) => set({ markupPoints: [...get().markupPoints, p] }),
  clearMarkupPoints: () => set({ markupPoints: [] }),
  finishMarkup: (markup) => {
    const { comparison, currentPageKey } = get();
    if (!comparison) return;
    historyTracker.push(get, set, comparison);
    const owned: Markup = { ...markup, pageNumber: currentPageKey };
    const revisions = updateActiveRevision(comparison, (r) => ({ ...r, markups: [...r.markups, owned] }));
    set({ comparison: touch({ ...comparison, revisions }), markupPoints: [] });
    scheduleSave(get, set);
  },
  updateMarkup: (id, patch) => {
    const { comparison } = get();
    if (!comparison) return;
    // Debounced like updateMarkupQuiet, so a drag burst and its closing call share one snapshot.
    // An empty patch is the "drag finished, save it" signal and must not open an undo step of its
    // own on a click that never moved anything.
    if (Object.keys(patch).length > 0) historyTracker.pushDebounced(get, set, comparison);
    const revisions = updateActiveRevision(comparison, (r) => ({
      ...r,
      markups: r.markups.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
    set({ comparison: touch({ ...comparison, revisions }) });
    scheduleSave(get, set);
  },
  updateMarkupQuiet: (id, patch) => {
    const { comparison } = get();
    if (!comparison) return;
    historyTracker.pushDebounced(get, set, comparison);
    const revisions = updateActiveRevision(comparison, (r) => ({
      ...r,
      markups: r.markups.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
    set({ comparison: { ...comparison, revisions } });
    markDirty(set);
  },
  deleteMarkup: (id) => {
    const { comparison } = get();
    if (!comparison) return;
    historyTracker.push(get, set, comparison);
    const revisions = updateActiveRevision(comparison, (r) => ({ ...r, markups: r.markups.filter((m) => m.id !== id) }));
    set({ comparison: touch({ ...comparison, revisions }), selectedMarkupId: get().selectedMarkupId === id ? null : get().selectedMarkupId });
    scheduleSave(get, set);
  },
  duplicateMarkup: (id) => {
    const { comparison } = get();
    if (!comparison) return;
    const active = comparison.revisions.find((r) => r.id === comparison.activeRevisionId);
    const original = active?.markups.find((m) => m.id === id);
    if (!original) return;
    historyTracker.push(get, set, comparison);
    const offset = 20;
    const copy: Markup = {
      ...original,
      id: uuid(),
      points: original.points.map((p) => ({ x: p.x + offset, y: p.y + offset })),
      createdAt: Date.now(),
    };
    const revisions = updateActiveRevision(comparison, (r) => ({ ...r, markups: [...r.markups, copy] }));
    set({ comparison: touch({ ...comparison, revisions }), selectedMarkupId: copy.id });
    scheduleSave(get, set);
  },
  setSelectedMarkupId: (id) => set({ selectedMarkupId: id }),

  setAreaKindColor: (kind, color) => {
    const { comparison } = get();
    if (!comparison) return;
    historyTracker.pushDebounced(get, set, comparison);
    set({ comparison: touch({ ...comparison, areaKindColors: { ...comparison.areaKindColors, [kind]: color } }) });
    scheduleSave(get, set);
  },

  updateComparisonMeta: (patch) => {
    const { comparison } = get();
    if (!comparison) return;
    historyTracker.pushDebounced(get, set, comparison);
    set({ comparison: touch({ ...comparison, ...patch }) });
    scheduleSave(get, set);
  },

  persist: async () => {
    const { comparison } = get();
    if (!comparison) return;
    // A save happening now supersedes the scheduled one.
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    set({ saving: true });
    try {
      await dbSaveComparison(comparison);
      // Only clear the flag when nothing was edited while the write was in flight.
      if (get().comparison === comparison) set({ dirty: false });
      set({ saveError: null });
    } catch (err) {
      // Stays dirty: the work is not on disk, and the unload guard must keep warning.
      set({ saveError: err instanceof Error ? err.message : 'שמירה נכשלה' });
      console.error('Failed to save comparison', err);
    } finally {
      set({ saving: false });
    }
  },
}));
