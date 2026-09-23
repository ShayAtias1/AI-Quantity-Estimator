import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { AreaCalcMode, AreaKind, AreaShape, Calibration, ExportRegion, Markup, MarkupTool, Measurement, MeasureTool, Point, Project, Room, ToolMode, WorkItem, WorkType } from '../types';
import { DEFAULT_AREA_KIND_COLORS, PANEL_HEIGHT_M } from '../types';
import { saveProject as dbSaveProject, loadPdfBlob } from '../db/database';
import { createHistoryTracker } from '../lib/undoHistory';
import { loadPdfPlanSource } from '../lib/planSource';
import { runRoomDetection, type DetectionSummary } from '../lib/roomDetection';
import { buildWorkItemsForProfile, getRoomProfile } from '../lib/roomProfiles';

const historyTracker = createHistoryTracker<Project>();

/** How far a duplicated room is shifted from its source, in native page px, so the copy is visible. */
const ROOM_DUPLICATE_OFFSET = 30;

const ROOM_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea', '#0891b2', '#c026d3', '#65a30d'];

function nextColor(existing: number): string {
  return ROOM_COLORS[existing % ROOM_COLORS.length];
}

export function createEmptyProject(name: string, pdfFileName: string): Project {
  const now = Date.now();
  return {
    id: uuid(),
    name,
    createdAt: now,
    updatedAt: now,
    pdfFileName,
    pages: {},
    rooms: [],
    measurements: [],
    markups: [],
    defaultCladdingHeightM: 2.0,
    defaultPanelHeightM: PANEL_HEIGHT_M,
    defaultTilingWastePercent: 0,
    defaultTilingAsWastePercent: 0,
    defaultCladdingWastePercent: 0,
    defaultPanelsWastePercent: 0,
    areaKindColors: { ...DEFAULT_AREA_KIND_COLORS },
    wallHeightDefaultM: 2.5,
  };
}

/**
 * Deep clone of a room for any duplicate action (single room or whole apartment), so the two
 * paths can never drift apart on which fields they carry:
 * - new id for the room and for every work item;
 * - fresh point objects and a fresh work-item array — nothing is shared with the source;
 * - work items copied verbatim (overrides included), never rebuilt from the room profile, so
 *   manual edits such as a deleted item survive;
 * - `roomType` carries over (the user's own classification) while the auto-detection metadata is
 *   dropped: a copy is something the user made, not something the detector found.
 * `overrides` is applied last — callers use it for the translated points, page, apartment and colour.
 */
function cloneRoomForDuplicate(source: Room, overrides: Partial<Room> & { color: string }): Room {
  return {
    ...source,
    id: uuid(),
    points: source.points.map((p) => ({ x: p.x, y: p.y })),
    workItems: source.workItems.map((wi) => ({ ...wi, id: uuid() })),
    roomType: source.roomType,
    detectedType: undefined,
    detectionConfidence: undefined,
    ...overrides,
  };
}

/**
 * A detection suggestion, held in session state only — never part of `Project`, never persisted,
 * never counted in quantities. Mirrors what the detection engine already returns (see DetectedRoom)
 * plus the page it was found on and an id for the review list.
 */
export interface DetectionCandidate {
  id: string;
  pageNumber: number;
  points: Point[];
  /** Name the detector read off the plan; empty when it recognised none. */
  suggestedName: string;
  /** ROOM_PROFILES key the detector matched, or null when it could not classify the room. */
  roomTypeKey: string | null;
  /** Qualitative only ('high' = a room name was recognised) — not a probability. */
  confidence: 'high' | 'low';
}

/**
 * Turns an accepted candidate into an ordinary room. The accepted room is a normal room in every
 * way; `detectedType`/`detectionConfidence` are only metadata about where it came from, while
 * `roomType` records that the user confirmed that classification by accepting.
 */
function roomFromCandidate(candidate: DetectionCandidate, project: Project, seed: number, apartmentNumber: string): Room {
  const profile = getRoomProfile(candidate.roomTypeKey);
  return {
    id: uuid(),
    pageNumber: candidate.pageNumber,
    points: candidate.points.map((p) => ({ x: p.x, y: p.y })),
    closed: true,
    // `seed` counts up across a batch, so accepting several unnamed candidates gives each one its
    // own number instead of naming them all after the same room count.
    name: candidate.suggestedName || `חדר ${seed + 1}`,
    // Accepting is a manual act, so the room joins the apartment the user is working in — all the
    // detection metadata below is preserved untouched.
    apartmentNumber,
    notes: '',
    // Work items come from the one shared profile builder; an unclassified candidate becomes a
    // plain room with no work items, exactly like a room drawn by hand.
    workItems: profile ? buildWorkItemsForProfile(profile, project) : [],
    color: nextColor(seed),
    roomType: candidate.roomTypeKey ?? undefined,
    detectedType: candidate.roomTypeKey ?? undefined,
    detectionConfidence: candidate.confidence,
  };
}

function newRoom(project: Project, pageNumber: number, points: Point[], apartmentNumber: string): Room {
  return {
    id: uuid(),
    pageNumber,
    points,
    closed: true,
    name: `חדר ${project.rooms.length + 1}`,
    // Stamped from the apartment the user is working in; still editable per room afterwards.
    apartmentNumber,
    notes: '',
    workItems: [],
    color: nextColor(project.rooms.length),
  };
}

interface AppState {
  project: Project | null;
  currentPage: number;
  numPages: number;
  toolMode: ToolMode;
  selectedRoomId: string | null;
  /**
   * The room the user just finished drawing by hand (polygon or rectangle), so the sidebar can open
   * straight into its details. UI-only and not persisted; rooms that arrive any other way — accepted
   * detection candidates, duplicates, undo — never set it.
   */
  manuallyCreatedRoomId: string | null;
  calibrationPoints: Point[];
  drawingPoints: Point[];
  measureTool: MeasureTool | null;
  measurePoints: Point[];
  areaShape: AreaShape;
  areaCalcMode: AreaCalcMode;
  pendingAreaKind: AreaKind | null;
  /** When on, each new polygon vertex (or the second point of a distance measurement) snaps to a horizontal/vertical line from the previous one. */
  orthoSnap: boolean;
  /** Manual show/hide toggle for the room area markings drawn over the plan. */
  annotationsVisible: boolean;
  /** Manual show/hide toggle for the measurements drawn over the plan — independent of the markings toggle. */
  measurementsVisible: boolean;
  /** True from the moment a mutation happens until the next successful persist. */
  dirty: boolean;
  /** True while a persist is in flight. */
  saving: boolean;
  /** Message of the last failed persist, cleared on the next successful one. */
  saveError: string | null;

  /**
   * Apartment the user is currently working in. Newly created rooms are stamped with it, so a whole
   * apartment can be marked without retyping the number per room. Empty string = "ללא שיוך".
   * Session state only: apartments stay derived from `Room.apartmentNumber`, with no new entity and
   * no migration.
   */
  activeApartmentNumber: string;
  setActiveApartmentNumber: (apartmentNumber: string) => void;

  /** Chosen PDF-export crop region per page (native page coordinates). Not persisted — a per-session export setting. */
  exportRegions: Record<number, ExportRegion>;
  setExportRegion: (pageNumber: number, region: ExportRegion | null) => void;

  /** Undo/redo stacks of past/future project snapshots. Not persisted — reset whenever the project changes. */
  history: Project[];
  future: Project[];
  undo: () => void;
  redo: () => void;

  /** Auto room-detection progress state (not persisted). */
  detecting: boolean;
  detectionProgress: number; // 0..1
  detectionLabel: string;
  detectionSummary: DetectionSummary | null;
  /** Detection suggestions awaiting review. Session state — not in Project, not persisted, not in history. */
  detectionCandidates: DetectionCandidate[];
  /** Page the pending candidates belong to; they are dropped when the user leaves it. */
  detectionCandidatesPage: number | null;
  detectRooms: () => Promise<void>;
  /** Turns one candidate into a real room (one history entry) and drops it from the review list. */
  acceptDetectionCandidate: (candidateId: string) => string | null;
  /** Turns every remaining candidate into a room as a single history entry. Returns how many. */
  acceptAllDetectionCandidates: () => number;
  /** Drops one suggestion. No project change, no history, no save. */
  rejectDetectionCandidate: (candidateId: string) => void;
  /** Drops every suggestion (reject all / page change / Escape). No project change, no history. */
  clearDetectionCandidates: () => void;
  autoCalculateQuantities: () => number;
  clearDetectionSummary: () => void;

  setProject: (p: Project | null) => void;
  setCurrentPage: (n: number) => void;
  setNumPages: (n: number) => void;
  setToolMode: (m: ToolMode) => void;
  setSelectedRoomId: (id: string | null) => void;

  addCalibrationPoint: (p: Point) => void;
  clearCalibrationPoints: () => void;
  applyCalibration: (realDistanceMeters: number) => void;

  addDrawingPoint: (p: Point) => void;
  clearDrawingPoints: () => void;
  finishDrawing: () => void;
  finishRectangle: (p1: Point, p2: Point) => void;

  setMeasureTool: (t: MeasureTool | null) => void;
  setAreaShape: (s: AreaShape) => void;
  setAreaCalcMode: (m: AreaCalcMode) => void;
  setPendingAreaKind: (k: AreaKind | null) => void;
  setAreaKindColor: (kind: AreaKind, color: string) => void;
  setOrthoSnap: (v: boolean) => void;
  /**
   * The bottom quantities panel: whether it is open, how tall the user dragged it and whether it is
   * maximised. Session UI state only — nothing here is written to the project or to IndexedDB, and
   * nothing here can affect a quantity, a coordinate or an export.
   */
  quantitiesOpen: boolean;
  quantitiesHeight: number;
  quantitiesMaximized: boolean;
  setQuantitiesOpen: (open: boolean) => void;
  setQuantitiesHeight: (px: number) => void;
  toggleQuantitiesMaximized: () => void;

  toggleAnnotationsVisible: () => void;
  toggleMeasurementsVisible: () => void;
  addMeasurePoint: (p: Point) => void;
  clearMeasurePoints: () => void;
  finishMeasurement: (m: Measurement) => void;
  updateMeasurement: (id: string, patch: Partial<Measurement>) => void;
  deleteMeasurement: (id: string) => void;

  markupTool: MarkupTool | null;
  markupPoints: Point[];
  markupColor: string;
  selectedMarkupId: string | null;
  /** When on, markup lines (dimension/arrow/cloud) snap to horizontal/vertical from the previous point. */
  markupOrtho: boolean;
  setMarkupOrtho: (v: boolean) => void;
  setMarkupTool: (t: MarkupTool | null) => void;
  setMarkupColor: (c: string) => void;
  /** Label size multiplier applied to newly created text notes / dimension labels. */
  markupFontScale: number;
  setMarkupFontScale: (v: number) => void;
  addMarkupPoint: (p: Point) => void;
  clearMarkupPoints: () => void;
  finishMarkup: (m: Markup) => void;
  updateMarkup: (id: string, patch: Partial<Markup>) => void;
  /** Like updateMarkup but skips the undo snapshot and autosave schedule — for continuous drag updates. */
  updateMarkupQuiet: (id: string, patch: Partial<Markup>) => void;
  deleteMarkup: (id: string) => void;
  duplicateMarkup: (id: string) => void;
  setSelectedMarkupId: (id: string | null) => void;

  updateRoom: (id: string, patch: Partial<Room>) => void;
  /**
   * Sets (or clears, with null) the room type the user picked, and — only for a room that has no
   * work items yet — seeds the profile's work items. One mutation, so one undo step.
   * Returns what it did, so the panel can tell the user when existing work was left alone.
   */
  setRoomType: (roomId: string, roomType: string | null) => 'created' | 'kept' | 'none';
  /**
   * Copies a room (geometry, details, roomType and work items) into a new, fully independent room
   * offset by ROOM_DUPLICATE_OFFSET, selects it, and records it as a single undo step.
   * Returns the new room's id, or null when `roomId` does not exist.
   */
  duplicateRoom: (roomId: string) => string | null;
  /**
   * Copies every room of `sourceApartmentNumber` into `targetApartmentNumber`, keeping each room's
   * own geometry and page untouched (a typical apartment is duplicated for its quantities, not to
   * paste a shape elsewhere). One undo step. Returns how many rooms were copied.
   */
  duplicateApartment: (sourceApartmentNumber: string, targetApartmentNumber: string) => number;
  deleteRoom: (id: string) => void;
  addWorkItem: (roomId: string, type: WorkType) => void;
  updateWorkItem: (roomId: string, itemId: string, patch: Partial<WorkItem>) => void;
  removeWorkItem: (roomId: string, itemId: string) => void;
  moveRoomPoint: (roomId: string, pointIndex: number, p: Point) => void;
  deleteRoomPoint: (roomId: string, pointIndex: number) => void;

  updateProjectMeta: (
    patch: Partial<
      Pick<
        Project,
        | 'name'
        | 'defaultCladdingHeightM'
        | 'defaultPanelHeightM'
        | 'defaultTilingWastePercent'
        | 'defaultTilingAsWastePercent'
        | 'defaultCladdingWastePercent'
        | 'defaultPanelsWastePercent'
        | 'wallHeightDefaultM'
      >
    >
  ) => void;

  persist: () => Promise<void>;
}

/**
 * Marks the project as carrying unsaved work. Every mutation path goes through here: either via
 * `scheduleSave` (the normal autosave route) or directly, for the `*Quiet` variants that skip the
 * autosave schedule and persist only when the drag ends.
 */
function markDirty(set: (patch: Partial<AppState>) => void) {
  set({ dirty: true });
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(get: () => AppState, set: (patch: Partial<AppState>) => void) {
  markDirty(set);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void get().persist();
  }, 800);
}

export type SaveState = 'saving' | 'saved' | 'unsaved' | 'error';

/** Save state for the UI, derived from the existing flags — `useAppStore(selectSaveState)`. */
export function selectSaveState(s: AppState): SaveState {
  if (!s.project) return 'saved';
  if (s.saving) return 'saving';
  if (s.saveError) return 'error';
  return s.dirty ? 'unsaved' : 'saved';
}

export const useAppStore = create<AppState>((set, get) => ({
  project: null,
  currentPage: 1,
  numPages: 1,
  toolMode: 'select',
  selectedRoomId: null,
  manuallyCreatedRoomId: null,
  calibrationPoints: [],
  drawingPoints: [],
  measureTool: null,
  measurePoints: [],
  markupTool: null,
  markupPoints: [],
  markupColor: '#ef4444',
  markupOrtho: false,
  markupFontScale: 1,
  selectedMarkupId: null,
  areaShape: 'polygon',
  areaCalcMode: 'footprint',
  pendingAreaKind: null,
  orthoSnap: false,
  quantitiesOpen: false,
  quantitiesHeight: 320,
  quantitiesMaximized: false,
  annotationsVisible: true,
  measurementsVisible: true,
  dirty: false,
  saving: false,
  saveError: null,
  activeApartmentNumber: '',
  setActiveApartmentNumber: (apartmentNumber) => set({ activeApartmentNumber: apartmentNumber }),
  exportRegions: {},
  setExportRegion: (pageNumber, region) =>
    set((state) => {
      const next = { ...state.exportRegions };
      if (region) next[pageNumber] = region;
      else delete next[pageNumber];
      return { exportRegions: next };
    }),
  history: [],
  future: [],
  detecting: false,
  detectionProgress: 0,
  detectionLabel: '',
  detectionSummary: null,
  detectionCandidates: [],
  detectionCandidatesPage: null,

  setProject: (p) => {
    historyTracker.discard();
    // A project is always saved before it is opened (and on close), so a fresh switch starts clean.
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    set({
      project: p,
      dirty: false,
      saveError: null,
      currentPage: 1,
      selectedRoomId: null,
      selectedMarkupId: null,
      exportRegions: {},
      activeApartmentNumber: '',
      history: [],
      future: [],
      detectionSummary: null,
      detectionCandidates: [],
      detectionCandidatesPage: null,
      detecting: false,
      detectionProgress: 0,
    });
  },
  clearDetectionSummary: () => set({ detectionSummary: null }),
  detectRooms: async () => {
    const { project, currentPage, detecting } = get();
    if (!project || detecting) return;
    // A rerun replaces the previous review session rather than piling onto it.
    set({ detecting: true, detectionProgress: 0, detectionLabel: 'מתחיל…', detectionSummary: null, detectionCandidates: [], detectionCandidatesPage: null });
    try {
      const { source } = await loadPdfPlanSource(project.id, () => loadPdfBlob(project.id), currentPage);
      const { rooms: detected, summary } = await runRoomDetection(source, {
        onProgress: (f, label) => set({ detectionProgress: f, detectionLabel: label }),
      });

      // The run is async: if the user moved to another page (or another project) meanwhile, these
      // results describe a page they are no longer reviewing. Drop them rather than letting stale
      // suggestions sit in state for a page that is not on screen.
      if (get().currentPage !== currentPage || get().project?.id !== project.id) return;

      // Detection produces *suggestions only*: nothing is written to the project, no history entry
      // and no autosave. A candidate becomes a room only when the user accepts it.
      const candidates: DetectionCandidate[] = detected.map((d) => ({
        id: uuid(),
        pageNumber: currentPage,
        points: d.polygon,
        suggestedName: d.name,
        roomTypeKey: d.roomTypeKey,
        confidence: d.confidence,
      }));
      set({
        detectionCandidates: candidates,
        detectionCandidatesPage: candidates.length > 0 ? currentPage : null,
        detectionSummary: summary,
      });
    } catch (err) {
      set({ detectionLabel: err instanceof Error ? err.message : 'שגיאה בזיהוי' });
    } finally {
      set({ detecting: false });
    }
  },
  acceptDetectionCandidate: (candidateId) => {
    const { project, detectionCandidates } = get();
    if (!project) return null;
    const candidate = detectionCandidates.find((c) => c.id === candidateId && c.pageNumber === get().currentPage);
    if (!candidate) return null;

    historyTracker.push(get, set, project);
    const room = roomFromCandidate(candidate, project, project.rooms.length, get().activeApartmentNumber);
    set({
      project: { ...project, rooms: [...project.rooms, room], updatedAt: Date.now() },
      // The candidate leaves the review list; the rest stay for review. Candidates are session
      // state, so an undo of this room does not bring the suggestion back — that is fine.
      detectionCandidates: detectionCandidates.filter((c) => c.id !== candidateId),
      selectedRoomId: room.id,
    });
    scheduleSave(get, set);
    return room.id;
  },
  acceptAllDetectionCandidates: () => {
    const { project, detectionCandidates, currentPage } = get();
    if (!project) return 0;
    // Only what the user is actually reviewing on screen. Anything belonging to another page is
    // never accepted sight-unseen — it is dropped along with the rest of the review session.
    const accepted = detectionCandidates.filter((c) => c.pageNumber === currentPage);
    if (accepted.length === 0) return 0;

    // One push for the whole batch: a single undo removes every room it created.
    historyTracker.push(get, set, project);
    let seed = project.rooms.length;
    const activeApartment = get().activeApartmentNumber;
    const rooms = accepted.map((c) => roomFromCandidate(c, project, seed++, activeApartment));
    set({
      project: { ...project, rooms: [...project.rooms, ...rooms], updatedAt: Date.now() },
      detectionCandidates: [],
      detectionCandidatesPage: null,
      selectedRoomId: null,
    });
    scheduleSave(get, set);
    return rooms.length;
  },
  rejectDetectionCandidate: (candidateId) => {
    // Pure session state: no project change, no history, no save.
    const remaining = get().detectionCandidates.filter((c) => c.id !== candidateId);
    set({ detectionCandidates: remaining, detectionCandidatesPage: remaining.length > 0 ? get().detectionCandidatesPage : null });
  },
  clearDetectionCandidates: () => {
    if (get().detectionCandidates.length === 0 && get().detectionCandidatesPage === null) return;
    set({ detectionCandidates: [], detectionCandidatesPage: null });
  },
  autoCalculateQuantities: () => {
    const { project, currentPage } = get();
    if (!project) return 0;
    // Only fill in rooms on this page that were detected and have no work items yet, so re-running
    // (or running after manual edits) never duplicates or overwrites the user's own choices.
    const targets = project.rooms.filter((r) => r.pageNumber === currentPage && r.detectedType && r.workItems.length === 0);
    if (targets.length === 0) return 0;
    historyTracker.push(get, set, project);
    const targetIds = new Set(targets.map((r) => r.id));
    const rooms = project.rooms.map((r) => {
      if (!targetIds.has(r.id)) return r;
      // A type the user confirmed wins over the detected guess; both go through the same builder.
      const profile = getRoomProfile(r.roomType ?? r.detectedType);
      if (!profile) return r;
      return { ...r, workItems: buildWorkItemsForProfile(profile, project) };
    });
    set({ project: { ...project, rooms, updatedAt: Date.now() } });
    scheduleSave(get, set);
    return targets.length;
  },
  undo: () => {
    historyTracker.flush(get, set);
    const { project, history, future } = get();
    if (!project || history.length === 0) return;
    const previous = history[history.length - 1];
    set({ project: previous, history: history.slice(0, -1), future: [project, ...future], selectedRoomId: null });
    scheduleSave(get, set);
  },
  redo: () => {
    // Same as undo: a mutation still sitting in the history debounce has to be recorded first, or
    // redo would restore a future snapshot on top of an un-snapshotted change. (Recording it also
    // clears `future`, which is correct — a new edit invalidates the redo stack.)
    historyTracker.flush(get, set);
    const { project, history, future } = get();
    if (!project || future.length === 0) return;
    const next = future[0];
    set({ project: next, history: [...history, project], future: future.slice(1), selectedRoomId: null });
    scheduleSave(get, set);
  },
  setCurrentPage: (n) => {
    // Selecting a room from the list re-sets the page it is already on; that must not throw away a
    // detection review the user is in the middle of. Candidates are tied to a page, so they are
    // dropped only when the page actually changes.
    const pageChanged = n !== get().currentPage;
    set({
      currentPage: n,
      ...(pageChanged ? { detectionCandidates: [], detectionCandidatesPage: null } : {}),
      selectedRoomId: null,
      selectedMarkupId: null,
      drawingPoints: [],
      calibrationPoints: [],
      measurePoints: [],
      markupPoints: [],
    });
  },
  setNumPages: (n) => set({ numPages: n }),
  setToolMode: (m) =>
    set({
      toolMode: m,
      calibrationPoints: [],
      drawingPoints: [],
      measurePoints: [],
      markupPoints: [],
    }),
  setSelectedRoomId: (id) => set({ selectedRoomId: id }),

  addCalibrationPoint: (p) => {
    const pts = [...get().calibrationPoints, p];
    set({ calibrationPoints: pts.slice(-2) });
  },
  clearCalibrationPoints: () => set({ calibrationPoints: [] }),
  applyCalibration: (realDistanceMeters) => {
    const { project, calibrationPoints, currentPage } = get();
    if (!project || calibrationPoints.length !== 2 || realDistanceMeters <= 0) return;
    const [a, b] = calibrationPoints;
    const pixelDistance = Math.hypot(b.x - a.x, b.y - a.y);
    if (pixelDistance === 0) return;
    const calibration: Calibration = {
      pixelDistance,
      realDistanceMeters,
      metersPerPixel: realDistanceMeters / pixelDistance,
    };
    const pages = {
      ...project.pages,
      [currentPage]: { pageNumber: currentPage, calibration },
    };
    historyTracker.push(get, set, project);
    const updated = { ...project, pages, updatedAt: Date.now() };
    set({ project: updated, calibrationPoints: [], toolMode: 'select' });
    scheduleSave(get, set);
  },

  addDrawingPoint: (p) => set({ drawingPoints: [...get().drawingPoints, p] }),
  clearDrawingPoints: () => set({ drawingPoints: [] }),
  finishDrawing: () => {
    const { project, drawingPoints, currentPage, activeApartmentNumber } = get();
    if (!project || drawingPoints.length < 3) {
      set({ drawingPoints: [] });
      return;
    }
    historyTracker.push(get, set, project);
    const room = newRoom(project, currentPage, drawingPoints, activeApartmentNumber);
    const updated = { ...project, rooms: [...project.rooms, room], updatedAt: Date.now() };
    set({ project: updated, drawingPoints: [], selectedRoomId: room.id, manuallyCreatedRoomId: room.id, toolMode: 'select' });
    scheduleSave(get, set);
  },
  finishRectangle: (p1, p2) => {
    const { project, currentPage, activeApartmentNumber } = get();
    if (!project) return;
    historyTracker.push(get, set, project);
    const points: Point[] = [p1, { x: p2.x, y: p1.y }, p2, { x: p1.x, y: p2.y }];
    const room = newRoom(project, currentPage, points, activeApartmentNumber);
    const updated = { ...project, rooms: [...project.rooms, room], updatedAt: Date.now() };
    set({ project: updated, drawingPoints: [], selectedRoomId: room.id, manuallyCreatedRoomId: room.id, toolMode: 'select' });
    scheduleSave(get, set);
  },

  setMeasureTool: (t) => set({ toolMode: t ? 'measure' : 'select', measureTool: t, measurePoints: [] }),
  setAreaShape: (s) => set({ areaShape: s, measurePoints: [] }),
  setAreaCalcMode: (m) => set({ areaCalcMode: m, measurePoints: [] }),
  setPendingAreaKind: (k) => set({ pendingAreaKind: k }),
  setAreaKindColor: (kind, color) => {
    const { project } = get();
    if (!project) return;
    // Debounced: a colour picker fires continuously while dragging, so the whole drag is one step.
    historyTracker.pushDebounced(get, set, project);
    set({ project: { ...project, areaKindColors: { ...project.areaKindColors, [kind]: color }, updatedAt: Date.now() } });
    scheduleSave(get, set);
  },
  setOrthoSnap: (v) => set({ orthoSnap: v }),
  setQuantitiesOpen: (open) => set({ quantitiesOpen: open, ...(open ? {} : { quantitiesMaximized: false }) }),
  // The height is clamped by the panel itself against the live viewport; the store only remembers it.
  setQuantitiesHeight: (px) => set({ quantitiesHeight: px }),
  toggleQuantitiesMaximized: () => set((s) => ({ quantitiesMaximized: !s.quantitiesMaximized })),

  toggleAnnotationsVisible: () => set((s) => ({ annotationsVisible: !s.annotationsVisible })),
  toggleMeasurementsVisible: () => set((s) => ({ measurementsVisible: !s.measurementsVisible })),
  addMeasurePoint: (p) => set({ measurePoints: [...get().measurePoints, p] }),
  clearMeasurePoints: () => set({ measurePoints: [] }),
  finishMeasurement: (m) => {
    const { project } = get();
    if (!project) return;
    historyTracker.push(get, set, project);
    const measurements = [...(project.measurements ?? []), m];
    set({ project: { ...project, measurements, updatedAt: Date.now() }, measurePoints: [] });
    scheduleSave(get, set);
  },
  updateMeasurement: (id, patch) => {
    const { project } = get();
    if (!project) return;
    historyTracker.pushDebounced(get, set, project);
    const measurements = (project.measurements ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m));
    set({ project: { ...project, measurements, updatedAt: Date.now() } });
    scheduleSave(get, set);
  },
  deleteMeasurement: (id) => {
    const { project } = get();
    if (!project) return;
    historyTracker.push(get, set, project);
    const measurements = (project.measurements ?? []).filter((m) => m.id !== id);
    set({ project: { ...project, measurements, updatedAt: Date.now() } });
    scheduleSave(get, set);
  },

  setMarkupTool: (t) => set({ toolMode: t ? 'markup' : 'select', markupTool: t, markupPoints: [] }),
  setMarkupColor: (c) => set({ markupColor: c }),
  setMarkupOrtho: (v) => set({ markupOrtho: v }),
  setMarkupFontScale: (v) => set({ markupFontScale: v }),
  addMarkupPoint: (p) => set({ markupPoints: [...get().markupPoints, p] }),
  clearMarkupPoints: () => set({ markupPoints: [] }),
  finishMarkup: (m) => {
    const { project } = get();
    if (!project) return;
    historyTracker.push(get, set, project);
    const markups = [...(project.markups ?? []), m];
    set({ project: { ...project, markups, updatedAt: Date.now() }, markupPoints: [] });
    scheduleSave(get, set);
  },
  updateMarkup: (id, patch) => {
    const { project } = get();
    if (!project) return;
    // Debounced like updateMarkupQuiet, so a move/resize burst collapses into one undo step — the
    // quiet updates during the drag and this closing call share the same pre-drag snapshot.
    // An empty patch is the "drag finished, save it" signal (PdfViewer's mouse-up); it changes
    // nothing on its own, so it must not open an undo step of its own on a click that never moved.
    if (Object.keys(patch).length > 0) historyTracker.pushDebounced(get, set, project);
    const markups = (project.markups ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m));
    set({ project: { ...project, markups, updatedAt: Date.now() } });
    scheduleSave(get, set);
  },
  updateMarkupQuiet: (id, patch) => {
    const { project } = get();
    if (!project) return;
    historyTracker.pushDebounced(get, set, project);
    const markups = (project.markups ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m));
    set({ project: { ...project, markups } });
    markDirty(set);
  },
  deleteMarkup: (id) => {
    const { project, selectedMarkupId } = get();
    if (!project) return;
    historyTracker.push(get, set, project);
    const markups = (project.markups ?? []).filter((m) => m.id !== id);
    set({
      project: { ...project, markups, updatedAt: Date.now() },
      selectedMarkupId: selectedMarkupId === id ? null : selectedMarkupId,
    });
    scheduleSave(get, set);
  },
  duplicateMarkup: (id) => {
    const { project } = get();
    if (!project) return;
    const original = (project.markups ?? []).find((m) => m.id === id);
    if (!original) return;
    historyTracker.push(get, set, project);
    const offset = 20;
    const copy: Markup = {
      ...original,
      id: uuid(),
      points: original.points.map((p) => ({ x: p.x + offset, y: p.y + offset })),
      createdAt: Date.now(),
    };
    const markups = [...(project.markups ?? []), copy];
    set({ project: { ...project, markups, updatedAt: Date.now() }, selectedMarkupId: copy.id });
    scheduleSave(get, set);
  },
  setSelectedMarkupId: (id) => set({ selectedMarkupId: id }),

  updateRoom: (id, patch) => {
    const { project } = get();
    if (!project) return;
    historyTracker.pushDebounced(get, set, project);
    const rooms = project.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r));
    set({ project: { ...project, rooms, updatedAt: Date.now() } });
    scheduleSave(get, set);
  },
  setRoomType: (roomId, roomType) => {
    const { project } = get();
    if (!project) return 'none';
    const room = project.rooms.find((r) => r.id === roomId);
    if (!room) return 'none';

    const profile = getRoomProfile(roomType);
    // Work items are only seeded into an empty room. A room the user has already filled in keeps
    // its items untouched — picking a type must never erase decisions they already made.
    const seeded = profile && room.workItems.length === 0 ? buildWorkItemsForProfile(profile, project) : null;
    const outcome: 'created' | 'kept' | 'none' = seeded ? 'created' : profile && room.workItems.length > 0 ? 'kept' : 'none';

    // One push for the whole thing (type + any seeded items) = one undo step. The room's `name` is
    // never touched here: the user's name and the classification are separate fields.
    historyTracker.push(get, set, project);
    const rooms = project.rooms.map((r) =>
      r.id === roomId ? { ...r, roomType, ...(seeded ? { workItems: seeded } : {}) } : r
    );
    set({ project: { ...project, rooms, updatedAt: Date.now() } });
    scheduleSave(get, set);
    return outcome;
  },
  duplicateRoom: (roomId) => {
    const { project } = get();
    if (!project) return null;
    const original = project.rooms.find((r) => r.id === roomId);
    // Unknown id: no state change, no history entry, no error.
    if (!original) return null;

    historyTracker.push(get, set, project);
    // Same page — cross-page duplication is the apartment action's job.
    // Rectangles are stored as a 4-point polygon like any other room, so offsetting the points
    // covers every geometry field there is.
    const copy = cloneRoomForDuplicate(original, {
      points: original.points.map((p) => ({ x: p.x + ROOM_DUPLICATE_OFFSET, y: p.y + ROOM_DUPLICATE_OFFSET })),
      name: original.name ? `${original.name} (עותק)` : 'חדר (עותק)',
      color: nextColor(project.rooms.length),
    });

    set({ project: { ...project, rooms: [...project.rooms, copy], updatedAt: Date.now() }, selectedRoomId: copy.id });
    scheduleSave(get, set);
    return copy.id;
  },
  duplicateApartment: (sourceApartmentNumber, targetApartmentNumber) => {
    const { project } = get();
    if (!project) return 0;
    const sourceRooms = project.rooms.filter((r) => r.apartmentNumber === sourceApartmentNumber);
    if (sourceRooms.length === 0) return 0;

    // Duplicating an apartment is about reusing its rooms and their quantities, not about placing
    // geometry somewhere new: every copy keeps the source room's own polygon and page exactly, so
    // areas and perimeters come out identical. One push = one undo for the whole apartment.
    historyTracker.push(get, set, project);
    let colorSeed = project.rooms.length;
    const copies = sourceRooms.map((r) =>
      cloneRoomForDuplicate(r, {
        apartmentNumber: targetApartmentNumber,
        color: nextColor(colorSeed++),
      })
    );

    set({
      project: { ...project, rooms: [...project.rooms, ...copies], updatedAt: Date.now() },
      selectedRoomId: copies[0].id,
    });
    scheduleSave(get, set);
    return copies.length;
  },
  deleteRoom: (id) => {
    const { project, selectedRoomId } = get();
    if (!project) return;
    historyTracker.push(get, set, project);
    const rooms = project.rooms.filter((r) => r.id !== id);
    set({
      project: { ...project, rooms, updatedAt: Date.now() },
      selectedRoomId: selectedRoomId === id ? null : selectedRoomId,
    });
    scheduleSave(get, set);
  },
  addWorkItem: (roomId, type) => {
    const { project } = get();
    if (!project) return;
    historyTracker.push(get, set, project);
    const rooms = project.rooms.map((r) => {
      if (r.id !== roomId) return r;
      const item: WorkItem = {
        id: uuid(),
        type,
        heightM: type === 'cladding' ? project.defaultCladdingHeightM : undefined,
        tilingCategory: type === 'tiling' ? 'regular' : undefined,
      };
      return { ...r, workItems: [...r.workItems, item] };
    });
    set({ project: { ...project, rooms, updatedAt: Date.now() } });
    scheduleSave(get, set);
  },
  updateWorkItem: (roomId, itemId, patch) => {
    const { project } = get();
    if (!project) return;
    historyTracker.pushDebounced(get, set, project);
    const rooms = project.rooms.map((r) => {
      if (r.id !== roomId) return r;
      const workItems = r.workItems.map((wi) => (wi.id === itemId ? { ...wi, ...patch } : wi));
      return { ...r, workItems };
    });
    set({ project: { ...project, rooms, updatedAt: Date.now() } });
    scheduleSave(get, set);
  },
  removeWorkItem: (roomId, itemId) => {
    const { project } = get();
    if (!project) return;
    historyTracker.push(get, set, project);
    const rooms = project.rooms.map((r) => {
      if (r.id !== roomId) return r;
      return { ...r, workItems: r.workItems.filter((wi) => wi.id !== itemId) };
    });
    set({ project: { ...project, rooms, updatedAt: Date.now() } });
    scheduleSave(get, set);
  },
  moveRoomPoint: (roomId, pointIndex, p) => {
    const { project } = get();
    if (!project) return;
    historyTracker.pushDebounced(get, set, project);
    const rooms = project.rooms.map((r) => {
      if (r.id !== roomId) return r;
      const points = r.points.map((pt, i) => (i === pointIndex ? p : pt));
      return { ...r, points };
    });
    set({ project: { ...project, rooms, updatedAt: Date.now() } });
    markDirty(set);
  },
  deleteRoomPoint: (roomId, pointIndex) => {
    const { project } = get();
    if (!project) return;
    historyTracker.push(get, set, project);
    const rooms = project.rooms.map((r) => {
      if (r.id !== roomId) return r;
      if (r.points.length <= 3) return r;
      return { ...r, points: r.points.filter((_, i) => i !== pointIndex) };
    });
    set({ project: { ...project, rooms, updatedAt: Date.now() } });
    scheduleSave(get, set);
  },

  updateProjectMeta: (patch) => {
    const { project } = get();
    if (!project) return;
    historyTracker.pushDebounced(get, set, project);
    set({ project: { ...project, ...patch, updatedAt: Date.now() } });
    scheduleSave(get, set);
  },

  persist: async () => {
    const { project } = get();
    if (!project) return;
    // A save that is happening now supersedes the scheduled one.
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    set({ saving: true });
    try {
      await dbSaveProject(project);
      // Only clear the flag if nothing was edited while the write was in flight — otherwise those
      // newer edits are still unsaved.
      if (get().project === project) set({ dirty: false });
      set({ saveError: null });
    } catch (err) {
      // Stays dirty: the work is not on disk, and the beforeunload guard must keep warning.
      set({ saveError: err instanceof Error ? err.message : 'שמירה נכשלה' });
      console.error('Failed to save project', err);
    } finally {
      set({ saving: false });
    }
  },
}));
