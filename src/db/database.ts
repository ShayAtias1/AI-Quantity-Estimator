import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Project } from '../types';
import type { Comparison, CompareLayer } from '../types/compare';

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

export async function saveComparison(comparison: Comparison): Promise<void> {
  const db = await getDb();
  await db.put('comparisons', comparison);
}

export async function listComparisons(): Promise<Comparison[]> {
  const db = await getDb();
  const all = await db.getAll('comparisons');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadComparison(id: string): Promise<Comparison | undefined> {
  const db = await getDb();
  return db.get('comparisons', id);
}

export async function deleteComparison(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('comparisons', id);
  await db.delete('comparePdfFiles', `${id}:original`);
  await db.delete('comparePdfFiles', `${id}:revised`);
}

export async function saveComparePdfBlob(comparisonId: string, layer: CompareLayer, blob: Blob): Promise<void> {
  const db = await getDb();
  await db.put('comparePdfFiles', blob, `${comparisonId}:${layer}`);
}

export async function loadComparePdfBlob(comparisonId: string, layer: CompareLayer): Promise<Blob | undefined> {
  const db = await getDb();
  return db.get('comparePdfFiles', `${comparisonId}:${layer}`);
}
