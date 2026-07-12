import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { AreaShape, Calibration, Measurement, MeasureTool, Point, Project, Room, ToolMode, WorkItem, WorkType } from '../types';
import { saveProject as dbSaveProject, loadPdfBlob } from '../db/database';
import { createHistoryTracker } from '../lib/undoHistory';
import { loadPdfPlanSource } from '../lib/planSource';
import { runRoomDetection, getRoomProfile, type DetectionSummary } from '../lib/roomDetection';

const historyTracker = createHistoryTracker<Project>();

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
    defaultCladdingHeightM: 2.0,
    defaultTilingWastePercent: 0,
    defaultCladdingWastePercent: 0,
    defaultPanelsWastePercent: 0,
  };
}

function newRoom(project: Project, pageNumber: number, points: Point[]): Room {
  return {
    id: uuid(),
    pageNumber,
    points,
    closed: true,
    name: `חדר ${project.rooms.length + 1}`,
    apartmentNumber: '',
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
  calibrationPoints: Point[];
  drawingPoints: Point[];
  measureTool: MeasureTool | null;
  measurePoints: Point[];
  areaShape: AreaShape;
  /** When on, each new polygon vertex (or the second point of a distance measurement) snaps to a horizontal/vertical line from the previous one. */
  orthoSnap: boolean;
  /** Manual show/hide toggle for the room area markings drawn over the plan. */
  annotationsVisible: boolean;
  dirty: boolean;

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
  detectRooms: () => Promise<void>;
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
  setOrthoSnap: (v: boolean) => void;
  toggleAnnotationsVisible: () => void;
  addMeasurePoint: (p: Point) => void;
  clearMeasurePoints: () => void;
  finishMeasurement: (m: Measurement) => void;
  deleteMeasurement: (id: string) => void;

  updateRoom: (id: string, patch: Partial<Room>) => void;
  deleteRoom: (id: string) => void;
  addWorkItem: (roomId: string, type: WorkType) => void;
  updateWorkItem: (roomId: string, itemId: string, patch: Partial<WorkItem>) => void;
  removeWorkItem: (roomId: string, itemId: string) => void;
  moveRoomPoint: (roomId: string, pointIndex: number, p: Point) => void;
  deleteRoomPoint: (roomId: string, pointIndex: number) => void;

  updateProjectMeta: (
    patch: Partial<
      Pick<Project, 'name' | 'defaultCladdingHeightM' | 'defaultTilingWastePercent' | 'defaultCladdingWastePercent' | 'defaultPanelsWastePercent'>
    >
  ) => void;

  persist: () => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(get: () => AppState) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void get().persist();
  }, 800);
}

export const useAppStore = create<AppState>((set, get) => ({
  project: null,
  currentPage: 1,
  numPages: 1,
  toolMode: 'select',
  selectedRoomId: null,
  calibrationPoints: [],
  drawingPoints: [],
  measureTool: null,
  measurePoints: [],
  areaShape: 'polygon',
  orthoSnap: false,
  annotationsVisible: true,
  dirty: false,
  history: [],
  future: [],
  detecting: false,
  detectionProgress: 0,
  detectionLabel: '',
  detectionSummary: null,

  setProject: (p) => {
    historyTracker.discard();
    set({
      project: p,
      currentPage: 1,
      selectedRoomId: null,
      history: [],
      future: [],
      detectionSummary: null,
      detecting: false,
      detectionProgress: 0,
    });
  },
  clearDetectionSummary: () => set({ detectionSummary: null }),
  detectRooms: async () => {
    const { project, currentPage, detecting } = get();
    if (!project || detecting) return;
    set({ detecting: true, detectionProgress: 0, detectionLabel: 'מתחיל…', detectionSummary: null });
    try {
      const { source } = await loadPdfPlanSource(project.id, () => loadPdfBlob(project.id), currentPage);
      const { rooms: detected, summary } = await runRoomDetection(source, {
        onProgress: (f, label) => set({ detectionProgress: f, detectionLabel: label }),
      });

      const current = get().project;
      if (!current) return;
      historyTracker.push(get, set, current);
      let colorSeed = current.rooms.length;
      const newRooms: Room[] = detected.map((d) => ({
        id: uuid(),
        pageNumber: currentPage,
        points: d.polygon,
        closed: true,
        name: d.name,
        apartmentNumber: '',
        notes: '',
        workItems: [],
        color: nextColor(colorSeed++),
        detectedType: d.roomTypeKey ?? undefined,
        detectionConfidence: d.confidence,
      }));
      set({
        project: { ...current, rooms: [...current.rooms, ...newRooms], updatedAt: Date.now() },
        detectionSummary: summary,
      });
      scheduleSave(get);
    } catch (err) {
      set({ detectionLabel: err instanceof Error ? err.message : 'שגיאה בזיהוי' });
    } finally {
      set({ detecting: false });
    }
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
      const profile = getRoomProfile(r.detectedType);
      if (!profile) return r;
      const workItems: WorkItem[] = [];
      workItems.push({ id: uuid(), type: 'tiling', tilingCategory: profile.tiling });
      if (profile.cladding) workItems.push({ id: uuid(), type: 'cladding', heightM: project.defaultCladdingHeightM });
      if (profile.panels) workItems.push({ id: uuid(), type: 'panels' });
      return { ...r, workItems };
    });
    set({ project: { ...project, rooms, updatedAt: Date.now() } });
    scheduleSave(get);
    return targets.length;
  },
  undo: () => {
    historyTracker.flush(get, set);
    const { project, history, future } = get();
    if (!project || history.length === 0) return;
    const previous = history[history.length - 1];
    set({ project: previous, history: history.slice(0, -1), future: [project, ...future], selectedRoomId: null });
    scheduleSave(get);
  },
  redo: () => {
    const { project, history, future } = get();
    if (!project || future.length === 0) return;
    const next = future[0];
    set({ project: next, history: [...history, project], future: future.slice(1), selectedRoomId: null });
    scheduleSave(get);
  },
  setCurrentPage: (n) =>
    set({ currentPage: n, selectedRoomId: null, drawingPoints: [], calibrationPoints: [], measurePoints: [] }),
  setNumPages: (n) => set({ numPages: n }),
  setToolMode: (m) => set({ toolMode: m, calibrationPoints: [], drawingPoints: [], measurePoints: [] }),
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
    scheduleSave(get);
  },

  addDrawingPoint: (p) => set({ drawingPoints: [...get().drawingPoints, p] }),
  clearDrawingPoints: () => set({ drawingPoints: [] }),
  finishDrawing: () => {
    const { project, drawingPoints, currentPage } = get();
    if (!project || drawingPoints.length < 3) {
      set({ drawingPoints: [] });
      return;
    }
    historyTracker.push(get, set, project);
    const room = newRoom(project, currentPage, drawingPoints);
    const updated = { ...project, rooms: [...project.rooms, room], updatedAt: Date.now() };
    set({ project: updated, drawingPoints: [], selectedRoomId: room.id, toolMode: 'select' });
    scheduleSave(get);
  },
  finishRectangle: (p1, p2) => {
    const { project, currentPage } = get();
    if (!project) return;
    historyTracker.push(get, set, project);
    const points: Point[] = [p1, { x: p2.x, y: p1.y }, p2, { x: p1.x, y: p2.y }];
    const room = newRoom(project, currentPage, points);
    const updated = { ...project, rooms: [...project.rooms, room], updatedAt: Date.now() };
    set({ project: updated, drawingPoints: [], selectedRoomId: room.id, toolMode: 'select' });
    scheduleSave(get);
  },

  setMeasureTool: (t) => set({ toolMode: t ? 'measure' : 'select', measureTool: t, measurePoints: [] }),
  setAreaShape: (s) => set({ areaShape: s, measurePoints: [] }),
  setOrthoSnap: (v) => set({ orthoSnap: v }),
  toggleAnnotationsVisible: () => set((s) => ({ annotationsVisible: !s.annotationsVisible })),
  addMeasurePoint: (p) => set({ measurePoints: [...get().measurePoints, p] }),
  clearMeasurePoints: () => set({ measurePoints: [] }),
  finishMeasurement: (m) => {
    const { project } = get();
    if (!project) return;
    historyTracker.push(get, set, project);
    const measurements = [...(project.measurements ?? []), m];
    set({ project: { ...project, measurements, updatedAt: Date.now() }, measurePoints: [] });
    scheduleSave(get);
  },
  deleteMeasurement: (id) => {
    const { project } = get();
    if (!project) return;
    historyTracker.push(get, set, project);
    const measurements = (project.measurements ?? []).filter((m) => m.id !== id);
    set({ project: { ...project, measurements, updatedAt: Date.now() } });
    scheduleSave(get);
  },

  updateRoom: (id, patch) => {
    const { project } = get();
    if (!project) return;
    historyTracker.pushDebounced(get, set, project);
    const rooms = project.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r));
    set({ project: { ...project, rooms, updatedAt: Date.now() } });
    scheduleSave(get);
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
    scheduleSave(get);
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
    scheduleSave(get);
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
    scheduleSave(get);
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
    scheduleSave(get);
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
    scheduleSave(get);
  },

  updateProjectMeta: (patch) => {
    const { project } = get();
    if (!project) return;
    historyTracker.pushDebounced(get, set, project);
    set({ project: { ...project, ...patch, updatedAt: Date.now() } });
    scheduleSave(get);
  },

  persist: async () => {
    const { project } = get();
    if (!project) return;
    await dbSaveProject(project);
    set({ dirty: false });
  },
}));
