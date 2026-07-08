// Seam for future automatic change detection between an original and revised plan layer.
// Not implemented yet — always returns no detected changes. Wiring this up (line/dimension/area
// diffing) is future work; callers should treat the result as advisory and never required.
import type { DetectedChange } from '../types/compare';

export interface DiffEngineInput {
  originalCanvas: HTMLCanvasElement;
  revisedCanvas: HTMLCanvasElement;
}

export function detectChanges(_input: DiffEngineInput): DetectedChange[] {
  return [];
}
