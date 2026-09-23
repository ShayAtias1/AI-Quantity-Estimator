import { useEffect, useRef, useState } from 'react';
import { useAppStore, createEmptyProject } from '../store/appStore';
import { deleteProject, listProjects, savePdfBlob, saveProject } from '../db/database';
import type { Project } from '../types';
import SavedItemList, { type SavedItem } from './SavedItemList';
import Icon from './Icon';

/** What the row says about a project: what is in it, and when it was last touched. */
function projectMeta(p: Project): string {
  const updated = `עודכן ${new Date(p.updatedAt).toLocaleDateString('he-IL')}`;
  if (p.rooms.length === 0) return `עדיין ריק · ${updated}`;
  const pages = new Set(p.rooms.map((r) => r.pageNumber)).size;
  const apartments = new Set(p.rooms.map((r) => r.apartmentNumber).filter(Boolean)).size;
  const parts = [`${p.rooms.length} חדרים`];
  if (apartments > 0) parts.push(`${apartments} דירות`);
  if (pages > 1) parts.push(`${pages} עמודים`);
  parts.push(updated);
  return parts.join(' · ');
}

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

  const handleDelete = async (id: string) => {
    if (!confirm('למחוק את הפרויקט? הפעולה בלתי הפיכה.')) return;
    await deleteProject(id);
    refresh();
  };

  const isPdf = (file: File) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  // Same flow as a new comparison: the dialog first, the file chosen inside it.
  const pickFile = (file: File | null | undefined) => {
    if (!file) return;
    if (!isPdf(file)) {
      alert('נא לבחור קובץ PDF');
      return;
    }
    setPendingFile(file);
    if (!newName.trim()) setNewName(file.name.replace(/\.pdf$/i, ''));
  };

  const closeDialog = () => {
    setCreating(false);
    setPendingFile(null);
    setNewName('');
  };

  const confirmCreate = async () => {
    if (!pendingFile) return;
    const project = createEmptyProject(newName || 'פרויקט חדש', pendingFile.name);
    await savePdfBlob(project.id, pendingFile);
    await saveProject(project);
    closeDialog();
    setProject(project);
  };

  const items: SavedItem[] = projects.map((p) => ({ id: p.id, name: p.name, meta: projectMeta(p) }));

  return (
    <div className="home-panel">
      <div className="home-panel-head">
        <div className="home-panel-text">
          <h2>חישוב כמויות</h2>
          <p className="muted">חישוב ריצוף, חיפוי ופנלים מתוך תוכנית PDF, עד כתב כמויות מלא.</p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          <Icon name="plus" />
          פרויקט חדש
        </button>
      </div>

      <span className="section-label">פרויקטים שמורים</span>
      <SavedItemList
        items={items}
        icon="map"
        loading={loading}
        emptyText="אין עדיין פרויקטים שמורים. צור פרויקט חדש מקובץ PDF של התוכנית."
        onOpen={(id) => {
          const project = projects.find((p) => p.id === id);
          if (project) setProject(project);
        }}
        onDelete={(id) => void handleDelete(id)}
        openTitle="פתח את הפרויקט"
        deleteTitle="מחק פרויקט"
      />

      {creating && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>פרויקט חדש</h3>
            <div className="form-row">
              <label>שם הפרויקט</label>
              <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="לדוגמה: מגדל הכרמל — קומה טיפוסית" />
            </div>
            <div className="form-row">
              <label>תוכנית (PDF)</label>
              <button className="btn-secondary file-pick" onClick={() => fileInputRef.current?.click()}>
                <Icon name={pendingFile ? 'check' : 'file'} />
                {pendingFile ? pendingFile.name : 'בחר קובץ PDF'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                hidden
                onChange={(e) => {
                  pickFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={closeDialog}>
                ביטול
              </button>
              <button className="btn-primary" onClick={confirmCreate} disabled={!pendingFile || !newName.trim()}>
                צור פרויקט
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
