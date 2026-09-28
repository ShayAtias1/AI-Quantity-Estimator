import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { deleteProject, listProjects, type ProjectWithPlans } from '../db/database';
import SavedItemList, { type SavedItem } from './SavedItemList';
import Icon from './Icon';

/** What the row says about a project: its plans and rooms, and when it was last touched. */
function projectMeta({ project, plans, comparisons }: ProjectWithPlans): string {
  const lastTouched = Math.max(project.updatedAt, ...plans.map((p) => p.updatedAt), ...comparisons.map((c) => c.updatedAt));
  const updated = `עודכן ${new Date(lastTouched).toLocaleDateString('he-IL')}`;
  if (plans.length === 0 && comparisons.length === 0) return `עדיין ריק · ${updated}`;
  const rooms = plans.reduce((n, p) => n + p.rooms.length, 0);
  const parts: string[] = [];
  if (plans.length > 0) parts.push(plans.length === 1 ? 'תוכנית אחת' : `${plans.length} תוכניות`);
  if (rooms > 0) parts.push(`${rooms} חדרים`);
  if (comparisons.length > 0) parts.push(comparisons.length === 1 ? 'השוואה אחת' : `${comparisons.length} השוואות`);
  parts.push(updated);
  return parts.join(' · ');
}

export default function StartScreen() {
  const openProject = useAppStore((s) => s.openProject);
  const createProject = useAppStore((s) => s.createProject);
  const [projects, setProjects] = useState<ProjectWithPlans[]>([]);
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
    const entry = projects.find((p) => p.project.id === id);
    const count = (entry?.plans.length ?? 0) + (entry?.comparisons.length ?? 0);
    if (!confirm(`למחוק את הפרויקט${count > 0 ? ' ואת כל התוכניות וההשוואות שבו' : ''}? הפעולה בלתי הפיכה.`)) return;
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

  // The first plan is optional: a project can start empty and get its plans from the overview.
  const confirmCreate = async () => {
    const name = newName.trim() || 'פרויקט חדש';
    const file = pendingFile;
    closeDialog();
    await createProject(name, file ? { file, name: file.name.replace(/\.pdf$/i, '') || 'תוכנית 1' } : undefined);
  };

  const items: SavedItem[] = projects.map((p) => ({ id: p.project.id, name: p.project.name, meta: projectMeta(p) }));

  return (
    <div className="home-panel">
      <div className="home-panel-head">
        <div className="home-panel-text">
          <h2>פרויקטים</h2>
          <p className="muted">פרויקט מרכז את תוכניות הכמויות ואת השוואות הגרסאות שלו — וכתב כמויות אחד לכל הפרויקט.</p>
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
        emptyText="אין עדיין פרויקטים שמורים. צור פרויקט חדש והוסף לו תוכניות PDF."
        onOpen={(id) => void openProject(id)}
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
              <label>תוכנית ראשונה (PDF, לא חובה)</label>
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
