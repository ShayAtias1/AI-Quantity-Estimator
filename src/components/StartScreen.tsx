import { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { deleteProject, listProjects, type ProjectWithPlans } from '../db/database';
import { trackProjectOpened } from '../lib/analytics';
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

  const closeDialog = () => {
    setCreating(false);
    setNewName('');
  };

  // A project is only a name. It opens on its overview, where the user chooses what to add first —
  // a quantity plan or a revision comparison; nothing is uploaded or opened on their behalf.
  const confirmCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    closeDialog();
    await createProject(name);
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
        emptyText="אין עדיין פרויקטים שמורים. צור פרויקט חדש — ובתוכו תוסיף תוכניות כמויות והשוואות גרסאות."
        onOpen={(id) => {
          const entry = projects.find((p) => p.project.id === id);
          if (entry) trackProjectOpened(entry);
          void openProject(id);
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
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void confirmCreate();
                  else if (e.key === 'Escape') closeDialog();
                }}
                placeholder="לדוגמה: מגדל הכרמל — קומה טיפוסית"
              />
              <p className="form-hint muted">אחרי היצירה תבחר מה להוסיף לפרויקט: תוכנית כמויות או השוואת גרסאות.</p>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={closeDialog}>
                ביטול
              </button>
              <button className="btn-primary" onClick={() => void confirmCreate()} disabled={!newName.trim()}>
                צור פרויקט
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
