import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { buildProjectQuantities, PLAN_STATUS_LABELS, type CategoryAmount } from '../lib/projectQuantities';
import { exportProjectToExcel } from '../lib/exportProjectExcel';
import { exportProjectToPdf } from '../lib/exportProjectPdf';
import { projectExportDetails, trackedExport } from '../lib/analytics';
import { notifyExportFailed } from '../lib/exportFailure';
import { AREA_UNIT, PANEL_LENGTH_UNIT } from '../types';
import Icon from './Icon';
import BrandLogo from './BrandLogo';
import NewComparisonDialog from './compare/NewComparisonDialog';
import type { Comparison } from '../types/compare';

/** What a comparison row says: which flat, how many revised plans, when it was last touched. */
function comparisonMeta(c: Comparison): string {
  const parts: string[] = [];
  if (c.apartmentNumber) parts.push(`דירה ${c.apartmentNumber}`);
  parts.push(c.revisions.length === 0 ? 'אין עדיין גרסה' : c.revisions.length === 1 ? 'גרסה אחת' : `${c.revisions.length} גרסאות`);
  parts.push(`עודכן ${new Date(c.updatedAt).toLocaleDateString('he-IL')}`);
  return parts.join(' · ');
}

const DASH = '—';
const fmt = (v: number | null) => (v == null ? DASH : v.toLocaleString('he-IL', { maximumFractionDigits: 2 }));

/** The main reading of an amount: running metres for skirting, m² for everything else. */
function primary(a: CategoryAmount): string {
  return a.lengthM != null ? `${fmt(a.lengthM)} ${PANEL_LENGTH_UNIT}` : `${fmt(a.quantityM2)} ${AREA_UNIT}`;
}
function primaryOrder(a: CategoryAmount): string {
  return a.orderLengthM != null ? `${fmt(a.orderLengthM)} ${PANEL_LENGTH_UNIT}` : `${fmt(a.orderM2)} ${AREA_UNIT}`;
}

/**
 * A project's home: its plans (open, add, rename, duplicate, delete), the project-wide quantity
 * summary with each total expandable into per-plan contributions, and the project exports.
 * Everything shown is computed from the saved plans by lib/projectQuantities.
 */
export default function ProjectOverview() {
  const project = useAppStore((s) => s.currentProject);
  const plans = useAppStore((s) => s.projectPlans);
  const closeProject = useAppStore((s) => s.closeProject);
  const renameProject = useAppStore((s) => s.renameProject);
  const openPlan = useAppStore((s) => s.openPlan);
  const addPlan = useAppStore((s) => s.addPlan);
  const duplicatePlan = useAppStore((s) => s.duplicatePlan);
  const deletePlan = useAppStore((s) => s.deletePlan);
  const renamePlan = useAppStore((s) => s.renamePlan);
  const refreshProjectPlans = useAppStore((s) => s.refreshProjectPlans);
  const comparisons = useAppStore((s) => s.projectComparisons);
  const createComparison = useAppStore((s) => s.createComparison);
  const openComparison = useAppStore((s) => s.openComparison);
  const renameComparison = useAppStore((s) => s.renameComparison);
  const deleteComparison = useAppStore((s) => s.deleteComparison);
  const [addingComparison, setAddingComparison] = useState(false);

  // Coming back from a plan or a comparison always shows what was just saved there.
  useEffect(() => {
    void refreshProjectPlans();
  }, [refreshProjectPlans]);

  const quantities = useMemo(() => buildProjectQuantities(plans), [plans]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  if (!project) return null;

  const isEmpty = plans.length === 0 && comparisons.length === 0;

  const toggle = (category: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  // A failed project export is reported to the user (and to analytics by trackedExport) — `run`
  // itself only manages the busy state.
  const runProjectExport = async (kind: 'project_excel' | 'project_pdf', exportFn: () => Promise<void>) => {
    try {
      await trackedExport({ export_kind: kind, surface: 'overview', ...projectExportDetails(project.id, plans) }, exportFn);
    } catch (err) {
      notifyExportFailed(err);
    }
  };

  const onRename = (planId: string, current: string) => {
    const next = window.prompt('שם התוכנית:', current);
    if (next && next.trim() && next.trim() !== current) void renamePlan(planId, next.trim());
  };

  const onDelete = (planId: string, name: string) => {
    if (!confirm(`למחוק את התוכנית "${name}" ואת כל המדידות שבה? הפעולה בלתי הפיכה.`)) return;
    void deletePlan(planId);
  };

  const onRenameComparison = (comparisonId: string, current: string) => {
    const next = window.prompt('שם ההשוואה:', current);
    if (next && next.trim() && next.trim() !== current) void renameComparison(comparisonId, next.trim());
  };

  const onDeleteComparison = (comparisonId: string, name: string) => {
    if (!confirm(`למחוק את ההשוואה "${name}" עם כל הגרסאות והסימונים שבה? הפעולה בלתי הפיכה.`)) return;
    void deleteComparison(comparisonId);
  };

  return (
    <div className="workspace home">
      <div className="top-bar">
        <div className="top-bar-group identity">
          <div className="app-brand" title="BetterCalc">
            <BrandLogo />
          </div>
          <input
            className="project-name-input"
            value={project.name}
            onChange={(e) => renameProject(e.target.value)}
            title="שם הפרויקט"
          />
        </div>
        <div className="top-bar-group grow" />
        <div className="top-bar-group output">
          <button className="btn-ghost small" onClick={() => void closeProject()} title="חזרה לרשימת הפרויקטים">
            <Icon name="exit" />
            <span className="btn-label">פרויקטים</span>
          </button>
        </div>
      </div>

      <div className="home-body">
        {isEmpty ? (
          // A new project holds nothing yet: the user explicitly picks which workflow to start.
          <div className="home-content project-overview">
            <div className="home-panel project-start">
              <div className="home-panel-text">
                <h2>מה תרצה להוסיף לפרויקט?</h2>
                <p className="muted">פרויקט יכול להכיל כמה תוכניות כמויות וכמה השוואות גרסאות. אפשר להוסיף את השני בכל שלב.</p>
              </div>
              <div className="project-start-options">
                <button className="project-start-option" onClick={() => setAdding(true)} disabled={!!busy}>
                  <Icon name="map" size={22} />
                  <span className="project-start-title">תוכנית כמויות חדשה</span>
                  <span className="project-start-desc muted">העלאת תוכנית PDF, כיול, סימון חדרים וחישוב כמויות לפי סוגי עבודה.</span>
                </button>
                <button className="project-start-option" onClick={() => setAddingComparison(true)} disabled={!!busy}>
                  <Icon name="layers" size={22} />
                  <span className="project-start-title">השוואת גרסאות חדשה</span>
                  <span className="project-start-desc muted">תוכנית מקור מול גרסה מעודכנת — יישור, שכבות וסימון הריסה ובנייה חדשה.</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="home-content project-overview">
            <div className="home-panel">
              <div className="home-panel-head">
                <div className="home-panel-text">
                  <h2>חישוב כמויות</h2>
                  <p className="muted">כל תוכנית נמדדת בנפרד — קנה מידה, חדרים ופתחים משלה.</p>
                </div>
                {/* The project exports cover the quantity plans only, so they live in this panel. */}
                <div className="panel-head-actions">
                  <button
                    className="btn-secondary"
                    disabled={!!busy || plans.length === 0}
                    onClick={() => void run('excel', () => runProjectExport('project_excel', () => exportProjectToExcel(project, plans)))}
                    title="כתב כמויות לכל תוכניות הפרויקט בקובץ Excel אחד"
                  >
                    <Icon name="sheet" />
                    {busy === 'excel' ? 'מייצא…' : 'Excel'}
                  </button>
                  <button
                    className="btn-secondary"
                    disabled={!!busy || plans.length === 0}
                    onClick={() => void run('pdf', () => runProjectExport('project_pdf', () => exportProjectToPdf(project, plans)))}
                    title="דוח כמויות PDF לכל תוכניות הפרויקט"
                  >
                    <Icon name="download" />
                    {busy === 'pdf' ? 'מייצא…' : 'PDF'}
                  </button>
                  <button className="btn-primary" onClick={() => setAdding(true)} disabled={!!busy}>
                    <Icon name="plus" />
                    תוכנית חדשה
                  </button>
                </div>
              </div>

              {plans.length === 0 ? (
                <div className="empty-state">
                  <Icon name="file" size={24} />
                  <p>אין עדיין תוכניות כמויות בפרויקט. הוסף תוכנית מקובץ PDF כדי להתחיל למדוד.</p>
                </div>
              ) : (
                <ul className="saved-list plan-list">
                  {quantities.plans.map((r) => (
                    <li key={r.plan.id} onClick={() => void openPlan(r.plan.id)} title="פתח את התוכנית">
                      <Icon name="map" />
                      <span className="saved-list-text">
                        <span className="saved-list-name">{r.plan.name}</span>
                        <span className="saved-list-meta">
                          {r.roomCount} חדרים ·{' '}
                          {r.calibratedPageCount > 0 ? `${r.calibratedPageCount} עמודים מכוילים` : 'לא כויל'}
                        </span>
                      </span>
                      <span className={`plan-status plan-status-${r.status}`}>{PLAN_STATUS_LABELS[r.status]}</span>
                      <span className="list-item-actions" onClick={(e) => e.stopPropagation()}>
                        <button className="icon-btn" title="שינוי שם" onClick={() => onRename(r.plan.id, r.plan.name)}>
                          <Icon name="text" />
                        </button>
                        <button
                          className="icon-btn"
                          title="שכפל תוכנית"
                          disabled={!!busy}
                          onClick={() => void run('dup', () => duplicatePlan(r.plan.id))}
                        >
                          <Icon name="copy" />
                        </button>
                        <button className="icon-btn danger" title="מחק תוכנית" onClick={() => onDelete(r.plan.id, r.plan.name)}>
                          <Icon name="trash" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="home-panel">
              <div className="home-panel-head">
                <div className="home-panel-text">
                  <h2>השוואת תוכניות</h2>
                  <p className="muted">תוכנית מקור מול גרסאות מעודכנות — יישור, שכבות, וסימון הריסה ובנייה חדשה.</p>
                </div>
                <button className="btn-primary" onClick={() => setAddingComparison(true)} disabled={!!busy}>
                  <Icon name="plus" />
                  השוואה חדשה
                </button>
              </div>

              {comparisons.length === 0 ? (
                <div className="empty-state">
                  <Icon name="layers" size={24} />
                  <p>אין עדיין השוואות בפרויקט. צור השוואה מתוכנית מקור ומגרסה מעודכנת.</p>
                </div>
              ) : (
                <ul className="saved-list plan-list">
                  {comparisons.map((c) => (
                    <li key={c.id} onClick={() => void openComparison(c.id)} title="פתח את ההשוואה">
                      <Icon name="layers" />
                      <span className="saved-list-text">
                        <span className="saved-list-name">{c.name}</span>
                        <span className="saved-list-meta">{comparisonMeta(c)}</span>
                      </span>
                      {/* TODO: "Move to Project" for comparisons — reassign `projectId` and move the id between the
                          two projects' `comparisonIds`. Also the way to fold legacy comparisons, which the
                          migration wrapped into one project each (`legacy-cmp-*`), into their real project. */}
                      <span className="list-item-actions" onClick={(e) => e.stopPropagation()}>
                        <button className="icon-btn" title="שינוי שם" onClick={() => onRenameComparison(c.id, c.name)}>
                          <Icon name="text" />
                        </button>
                        <button className="icon-btn danger" title="מחק השוואה" onClick={() => onDeleteComparison(c.id, c.name)}>
                          <Icon name="trash" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="home-panel">
              <div className="home-panel-text">
                <h2>סיכום כמויות לפרויקט</h2>
                <p className="muted">סכום כל התוכניות. לחץ על שורה כדי לראות את חלקה של כל תוכנית.</p>
              </div>
              {quantities.totals.length === 0 ? (
                <p className="muted project-summary-empty">אין עדיין כמויות — סמן חדרים בתוכניות והוסף להם סוגי עבודה.</p>
              ) : (
                <table className="qty-summary-table project-summary-table">
                  <thead>
                    <tr>
                      <th>פריט</th>
                      <th>כמות נטו</th>
                      <th>להזמנה (כולל פחת)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quantities.totals.map((t) => {
                      const open = expanded.has(t.category);
                      return (
                        <Fragment key={t.category}>
                          <tr className="project-summary-row" onClick={() => toggle(t.category)}>
                            <td>
                              <Icon name={open ? 'chevron-up' : 'chevron-down'} size={13} />
                              {t.label}
                            </td>
                            <td>{primary(t)}</td>
                            <td className="order">{primaryOrder(t)}</td>
                          </tr>
                          {open &&
                            t.perPlan.map((p) => (
                              <tr key={p.planId} className="project-summary-plan">
                                <td>{p.planName}</td>
                                <td>{primary(p)}</td>
                                <td>{primaryOrder(p)}</td>
                              </tr>
                            ))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {quantities.uncalibratedRoomCount > 0 && (
                <div className="warning-box">
                  {quantities.uncalibratedRoomCount} חדרים נמצאים בעמודים שלא כוילו ואינם נכללים בסיכום.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {addingComparison && (
        <NewComparisonDialog onClose={() => setAddingComparison(false)} onCreate={(input) => run('comparison', () => createComparison(input))} />
      )}
      {adding && <AddPlanDialog onClose={() => setAdding(false)} onAdd={(file, name) => run('add', () => addPlan(file, name))} />}
    </div>
  );
}

function AddPlanDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (file: File, name: string) => Promise<void> }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');

  const pick = (f: File | null | undefined) => {
    if (!f) return;
    if (!(f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))) {
      alert('נא לבחור קובץ PDF');
      return;
    }
    setFile(f);
    if (!name.trim()) setName(f.name.replace(/\.pdf$/i, ''));
  };

  const confirm = async () => {
    if (!file) return;
    onClose();
    await onAdd(file, name.trim() || 'תוכנית חדשה');
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>תוכנית כמויות חדשה</h3>
        <div className="form-row">
          <label>תוכנית (PDF)</label>
          <button className="btn-secondary file-pick" onClick={() => fileInputRef.current?.click()}>
            <Icon name={file ? 'check' : 'file'} />
            {file ? file.name : 'בחר קובץ PDF'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
        <div className="form-row">
          <label>שם התוכנית</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="לדוגמה: קומה 3" />
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            ביטול
          </button>
          <button className="btn-primary" onClick={() => void confirm()} disabled={!file}>
            הוסף תוכנית
          </button>
        </div>
      </div>
    </div>
  );
}
