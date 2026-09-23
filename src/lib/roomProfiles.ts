/**
 * Room type profiles — the shared catalogue of room kinds and the work they usually imply.
 *
 * These started out inside roomDetection.ts, where they are matched against plan text. They now
 * live here because the same catalogue backs the *manual* room-type picker in the sidebar, and
 * `buildWorkItemsForProfile` is the single place that turns a profile into work items (used by the
 * manual picker and by the auto-detection "calculate quantities" pass; future callers such as
 * duplicate-room should use it too rather than re-deriving the rules).
 *
 * A profile is a classification plus defaults. It is NOT a room name: the user names rooms freely,
 * and `Room.roomType` only records which profile they picked.
 */

import { v4 as uuid } from 'uuid';
import type { Project, WorkItem } from '../types';

export type TilingCategoryKey = 'regular' | 'as';

export interface RoomProfile {
  key: string;
  /** Name keywords (Hebrew). Matched as substrings against text found inside the room. */
  labels: string[];
  /** Human-readable name of the type — shown in the type picker, and used by detection to name a room it matched. */
  displayName: string;
  tiling: TilingCategoryKey;
  cladding: boolean;
  panels: boolean;
  /**
   * Optional per-profile overrides for the work items this profile creates. Intentionally unset on
   * every profile today: with no value here, items fall back to the project's own defaults
   * (waste % per work type, cladding height), which is exactly how they behaved before.
   */
  defaultWastePercent?: number;
  defaultCladdingHeightM?: number;
}

/** Ordered roughly specific→generic; matching prefers the longest label so "חדר רחצה" beats "חדר". */
export const ROOM_PROFILES: RoomProfile[] = [
  { key: 'bath', labels: ['חדר רחצה', 'חדר אמבטיה', 'אמבטיה', 'מקלחת', 'רחצה'], displayName: 'חדר רחצה', tiling: 'as', cladding: true, panels: false },
  { key: 'wc', labels: ['שירותי אורחים', 'שרותי אורחים', 'שירותים', 'שרותים', 'אסלה', 'שירות אורחים'], displayName: 'שירותים', tiling: 'as', cladding: true, panels: false },
  { key: 'service', labels: ['חדר שירות', 'חדר כביסה', 'כביסה', 'חדר רחצה שירות'], displayName: 'חדר שירות', tiling: 'as', cladding: false, panels: false },
  { key: 'kitchen', labels: ['מטבח', 'מטבחון'], displayName: 'מטבח', tiling: 'regular', cladding: true, panels: true },
  { key: 'balcony', labels: ['מרפסת שירות', 'מרפסת שמש', 'מרפסת'], displayName: 'מרפסת', tiling: 'as', cladding: false, panels: false },
  { key: 'safe', labels: ['ממ"ד', 'ממ״ד', 'ממד', 'מרחב מוגן', 'מקלט'], displayName: 'ממ"ד', tiling: 'regular', cladding: false, panels: true },
  { key: 'living', labels: ['סלון', 'חדר מגורים', 'מגורים', 'פינת אוכל'], displayName: 'סלון', tiling: 'regular', cladding: false, panels: true },
  { key: 'bedroom', labels: ['חדר שינה', 'חדר הורים', 'חדר ילדים', 'חדר שינה הורים', 'שינה', 'חדר'], displayName: 'חדר שינה', tiling: 'regular', cladding: false, panels: true },
  { key: 'hall', labels: ['פרוזדור', 'מסדרון', 'הול', 'כניסה', 'לובי'], displayName: 'פרוזדור', tiling: 'regular', cladding: false, panels: true },
  { key: 'storage', labels: ['מחסן', 'ארון', 'אחסון'], displayName: 'מחסן', tiling: 'regular', cladding: false, panels: false },
];

export function getRoomProfile(key: string | undefined | null): RoomProfile | null {
  if (!key) return null;
  return ROOM_PROFILES.find((p) => p.key === key) ?? null;
}

/** Display label for a type key — falls back to the raw key if a saved project references an unknown one. */
export function roomProfileLabel(key: string | undefined | null): string | null {
  if (!key) return null;
  return getRoomProfile(key)?.displayName ?? key;
}

/**
 * The work items a profile implies, with the project's defaults filled in (a profile-level override
 * wins over the project default when one is defined). This is the only place that rule lives.
 */
export function buildWorkItemsForProfile(profile: RoomProfile, project: Project): WorkItem[] {
  // Left off the item entirely when the profile has no opinion, so the item keeps following the
  // project default rather than freezing a copy of it.
  const waste = profile.defaultWastePercent != null ? { wastePercent: profile.defaultWastePercent } : {};
  const items: WorkItem[] = [];
  items.push({ id: uuid(), type: 'tiling', tilingCategory: profile.tiling, ...waste });
  if (profile.cladding) {
    items.push({
      id: uuid(),
      type: 'cladding',
      heightM: profile.defaultCladdingHeightM ?? project.defaultCladdingHeightM,
      ...waste,
    });
  }
  // Panel height is deliberately left unset so the item follows the project's default panel height.
  if (profile.panels) items.push({ id: uuid(), type: 'panels', ...waste });
  return items;
}
