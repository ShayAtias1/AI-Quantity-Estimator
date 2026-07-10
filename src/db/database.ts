import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { v4 as uuid } from 'uuid';
import type { Project } from '../types';
import { DEFAULT_AREA_KIND_COLORS, IDENTITY_TRANSFORM } from '../types/compare';
import type { Comparison, ComparisonPage, RevisionLayer } from '../types/compare';

interface QtoDB extends DBSchema {
  projects: {
    key: string;
    value: Project;
  };
  pdfFiles: {
    key: string; // projectId
    value: Blob;
  };
  comparisons: {
    key: string;
    value: Comparison;
  };
  comparePdfFiles: {
    key: string; // `${comparisonId}:${layer}`
    value: Blob;
  };
}

const DB_NAME = 'bettercalc-qto';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<QtoDB>> | null = null;

function getDb(): Promise<IDBPDatabase<QtoDB>> {
  if (!dbPromise) {
    dbPromise = openDB<QtoDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('pdfFiles')) {
          db.createObjectStore('pdfFiles');
        }
        if (!db.objectStoreNames.contains('comparisons')) {
          db.createObjectStore('comparisons', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('comparePdfFiles')) {
          db.createObjectStore('comparePdfFiles');
        }
      },
    });
  }
  return dbPromise;
}

export async function saveProject(project: Project): Promise<void> {
  const db = await getDb();
  await db.put('projects', project);
}

export async function savePdfBlob(projectId: string, blob: Blob): Promise<void> {
  const db = await getDb();
  await db.put('pdfFiles', blob, projectId);
}

export async function loadPdfBlob(projectId: string): Promise<Blob | undefined> {
  const db = await getDb();
  return db.get('pdfFiles', projectId);
}

export async function listProjects(): Promise<Project[]> {
  const db = await getDb();
  const all = await db.getAll('projects');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadProject(id: string): Promise<Project | undefined> {
  const db = await getDb();
  return db.get('projects', id);
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('projects', id);
  await db.delete('pdfFiles', id);
}

/**
 * Older saved comparisons had a single `revised*` layer instead of a `revisions` array.
 * Convert them in place (and move the matching PDF blob) the first time they're loaded.
 */
async function migrateComparisonIfNeeded(db: IDBPDatabase<QtoDB>, raw: Comparison): Promise<Comparison> {
  if (Array.isArray(raw.revisions) && raw.activeRevisionId) return raw;
  const legacy = raw as unknown as {
    revisedFileName?: string;
    revisedOpacity?: number;
    revisedVisible?: boolean;
    revisedColorTint?: string;
    revisedUseSourceColors?: boolean;
    pages: Record<
      number,
      {
        originalPageNumber: number;
        originalCalibration: ComparisonPage['originalCalibration'];
        revisedPageNumber?: number;
        revisedCalibration?: ComparisonPage['revisions'][string]['revisedCalibration'];
        alignment?: ComparisonPage['revisions'][string]['alignment'];
        alignmentPoints?: ComparisonPage['revisions'][string]['alignmentPoints'];
      }
    >;
  };
  const revisionId = uuid();
  const revision: RevisionLayer = {
    id: revisionId,
    label: 'מעודכן',
    fileName: legacy.revisedFileName ?? '',
    opacity: legacy.revisedOpacity ?? 0.75,
    visible: legacy.revisedVisible ?? true,
    colorTint: legacy.revisedColorTint ?? '#ef4444',
    useSourceColors: legacy.revisedUseSourceColors ?? false,
  };
  const pages: Record<number, ComparisonPage> = {};
  for (const [key, p] of Object.entries(legacy.pages ?? {})) {
    pages[Number(key)] = {
      originalPageNumber: p.originalPageNumber,
      originalCalibration: p.originalCalibration ?? null,
      revisions: {
        [revisionId]: {
          revisedPageNumber: p.revisedPageNumber ?? p.originalPageNumber,
          revisedCalibration: p.revisedCalibration ?? null,
          alignment: p.alignment ?? IDENTITY_TRANSFORM,
          alignmentPoints: p.alignmentPoints ?? [],
        },
      },
    };
  }
  const migrated: Comparison = {
    ...raw,
    pages,
    revisions: [revision],
    activeRevisionId: revisionId,
    areaKindColors: raw.areaKindColors ?? { ...DEFAULT_AREA_KIND_COLORS },
  };

  const oldBlob = await db.get('comparePdfFiles', `${raw.id}:revised`);
  if (oldBlob) {
    await db.put('comparePdfFiles', oldBlob, `${raw.id}:revision:${revisionId}`);
    await db.delete('comparePdfFiles', `${raw.id}:revised`);
  }
  await db.put('comparisons', migrated);
  return migrated;
}

export async function saveComparison(comparison: Comparison): Promise<void> {
  const db = await getDb();
  await db.put('comparisons', comparison);
}

export async function listComparisons(): Promise<Comparison[]> {
  const db = await getDb();
  const all = await db.getAll('comparisons');
  const migrated = await Promise.all(all.map((c) => migrateComparisonIfNeeded(db, c)));
  return migrated.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadComparison(id: string): Promise<Comparison | undefined> {
  const db = await getDb();
  const raw = await db.get('comparisons', id);
  if (!raw) return undefined;
  return migrateComparisonIfNeeded(db, raw);
}

export async function deleteComparison(id: string): Promise<void> {
  const db = await getDb();
  const existing = await db.get('comparisons', id);
  await db.delete('comparisons', id);
  await db.delete('comparePdfFiles', `${id}:original`);
  await db.delete('comparePdfFiles', `${id}:revised`);
  for (const revision of existing?.revisions ?? []) {
    await db.delete('comparePdfFiles', `${id}:revision:${revision.id}`);
  }
}

/** `layer` is 'original' or `revision:${revisionId}`. */
export async function saveComparePdfBlob(comparisonId: string, layer: string, blob: Blob): Promise<void> {
  const db = await getDb();
  await db.put('comparePdfFiles', blob, `${comparisonId}:${layer}`);
}

export async function loadComparePdfBlob(comparisonId: string, layer: string): Promise<Blob | undefined> {
  const db = await getDb();
  return db.get('comparePdfFiles', `${comparisonId}:${layer}`);
}

export async function deleteComparePdfBlob(comparisonId: string, layer: string): Promise<void> {
  const db = await getDb();
  await db.delete('comparePdfFiles', `${comparisonId}:${layer}`);
}
