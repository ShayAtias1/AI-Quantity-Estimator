import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { Calibration, Point, Project, Room, ToolMode, WorkItem, WorkType } from '../types';
import { saveProject as dbSaveProject } from '../db/database';

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
  dirty: boolean;

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
  dirty: false,

  setProject: (p) => set({ project: p, currentPage: 1, selectedRoomId: null }),
  setCurrentPage: (n) => set({ currentPage: n, selectedRoomId: null, drawingPoints: [], calibrationPoints: [] }),
  setNumPages: (n) => set({ numPages: n }),
  setToolMode: (m) => set({ toolMode: m, calibrationPoints: [], drawingPoints: [] }),
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
    const room = newRoom(project, currentPage, drawingPoints);
    const updated = { ...project, rooms: [...project.rooms, room], updatedAt: Date.now() };
    set({ project: updated, drawingPoints: [], selectedRoomId: room.id, toolMode: 'select' });
    scheduleSave(get);
  },
  finishRectangle: (p1, p2) => {
    const { project, currentPage } = get();
    if (!project) return;
    const points: Point[] = [p1, { x: p2.x, y: p1.y }, p2, { x: p1.x, y: p2.y }];
    const room = newRoom(project, currentPage, points);
    const updated = { ...project, rooms: [...project.rooms, room], updatedAt: Date.now() };
    set({ project: updated, drawingPoints: [], selectedRoomId: room.id, toolMode: 'select' });
    scheduleSave(get);
  },

  updateRoom: (id, patch) => {
    const { project } = get();
    if (!project) return;
    const rooms = project.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r));
    set({ project: { ...project, rooms, updatedAt: Date.now() } });
    scheduleSave(get);
  },
  deleteRoom: (id) => {
    const { project, selectedRoomId } = get();
    if (!project) return;
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
