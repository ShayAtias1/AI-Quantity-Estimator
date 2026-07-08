import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useAppStore, createEmptyProject } from '../store/appStore';
import { deleteProject, listProjects, savePdfBlob, saveProject } from '../db/database';
import type { Project } from '../types';

export default function StartScreen() {
  const setProject = useAppStore((s) => s.setProject);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [newName, setNewName] = useState('');

  const refresh = () => {
    listProjects()
      .then(setProjects)
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const openProject = (p: Project) => setProject(p);

  const handleDelete = async (e: MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('למחוק את הפרויקט? הפעולה בלתי הפיכה.')) return;
    await deleteProject(id);
    refresh();
  };

  const handleFilePicked = (file: File) => {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('נא לבחור קובץ PDF');
      return;
    }
    setPendingFile(file);
    setNewName(file.name.replace(/\.pdf$/i, ''));
    setCreating(true);
  };

  const confirmCreate = async () => {
    if (!pendingFile) return;
    const project = createEmptyProject(newName || 'פרויקט חדש', pendingFile.name);
    await savePdfBlob(project.id, pendingFile);
    await saveProject(project);
    setCreating(false);
    setPendingFile(null);
    setProject(project);
  };

  return (
    <div className="start-screen">
      <div className="start-hero">
        <h1>BetterCalc</h1>
        <p>חישוב כמויות מתוכניות אדריכליות — ריצוף, חיפוי ופנלים, ישירות מה-PDF</p>
        <button
          className="btn-primary large"
          onClick={() => fileInputRef.current?.click()}
        >
          + פרויקט חדש מקובץ PDF
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFilePicked(f);
            e.target.value = '';
          }}
        />
      </div>

      <div className="project-list-section">
        <h3>פרויקטים שמורים</h3>
        {loading && <p className="muted">טוען…</p>}
        {!loading && projects.length === 0 && <p className="muted">אין עדיין פרויקטים שמורים.</p>}
        <ul className="project-list">
          {projects.map((p) => (
            <li key={p.id} onClick={() => openProject(p)}>
              <div className="project-list-name">{p.name}</div>
              <div className="project-list-meta">
                {p.rooms.length} אזורים · עודכן {new Date(p.updatedAt).toLocaleDateString('he-IL')}
              </div>
              <button className="icon-btn danger" onClick={(e) => handleDelete(e, p.id)} title="מחק">
                ✕
              </button>
            </li>
          ))}
        </ul>
      </div>

      {creating && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>פרויקט חדש</h3>
            <div className="form-row">
              <label>שם הפרויקט</label>
              <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setCreating(false);
                  setPendingFile(null);
                }}
              >
                ביטול
              </button>
              <button className="btn-primary" onClick={confirmCreate} disabled={!newName.trim()}>
                צור פרויקט
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
