import { create } from 'zustand';
import {
  DEFAULT_GRID_OPACITY,
  DEFAULT_GRID_SPACING_M,
  clampGridOpacity,
  parseGridSpacing,
} from '../lib/grid';

/**
 * Display settings of the measurement grid. A view preference of this browser — like the UI
 * language, kept in its own localStorage key and never in a plan — so it survives reloads without
 * touching the saved plan format. Whether the grid can actually show is decided per page by the
 * page's calibration (see `computeGrid`).
 */
const STORAGE_KEY = 'bettercalc.grid';

interface GridPrefs {
  enabled: boolean;
  spacingM: number;
  opacity: number;
}

const DEFAULTS: GridPrefs = { enabled: false, spacingM: DEFAULT_GRID_SPACING_M, opacity: DEFAULT_GRID_OPACITY };

/** Saved preferences, field by field validated; storage can be missing, blocked or hold junk. */
export function readGridPrefs(raw: string | null): GridPrefs {
  if (!raw) return DEFAULTS;
  try {
    const v = JSON.parse(raw) as Partial<GridPrefs> | null;
    return {
      enabled: v?.enabled === true,
      spacingM: parseGridSpacing(v?.spacingM) ?? DEFAULTS.spacingM,
      opacity: clampGridOpacity(v?.opacity),
    };
  } catch {
    return DEFAULTS;
  }
}

function load(): GridPrefs {
  try {
    return readGridPrefs(typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null);
  } catch {
    return DEFAULTS;
  }
}

interface GridState extends GridPrefs {
  setEnabled: (enabled: boolean) => void;
  setSpacingM: (spacingM: number) => void;
  setOpacity: (opacity: number) => void;
}

export const useGridStore = create<GridState>((set, get) => {
  const update = (patch: Partial<GridPrefs>) => {
    set(patch);
    const { enabled, spacingM, opacity } = get();
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled, spacingM, opacity }));
    } catch {
      // still applies for this session
    }
  };
  return {
    ...load(),
    setEnabled: (enabled) => update({ enabled }),
    setSpacingM: (spacingM) => {
      const valid = parseGridSpacing(spacingM);
      if (valid !== null) update({ spacingM: valid });
    },
    setOpacity: (opacity) => update({ opacity: clampGridOpacity(opacity) }),
  };
});
