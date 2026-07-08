import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useCompareStore, createEmptyComparison } from '../../store/compareStore';
import { deleteComparison, listComparisons, saveComparePdfBlob, saveComparison } from '../../db/database';
import type { Comparison } from '../../types/compare';

export default function CompareStartScreen() {
  const setComparison = useCompareStore((s) => s.setComparison);
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const originalInputRef = useRef<HTMLInputElement>(null);
  const revisedInputRef = useRef<HTMLInputElement>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [revisedFile, setRevisedFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [apartmentNumber, setApartmentNumber] = useState('');

  const refresh = () => {
    listComparisons()
      .then(setComparisons)
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const openComparison = (c: Comparison) => setComparison(c);

  const handleDelete = async (e: MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('למחוק את ההשוואה? הפעולה בלתי הפיכה.')) return;
    await deleteComparison(id);
    refresh();
  };

  const pickPdf = (file: File | null | undefined, kind: 'original' | 'revised') => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('נא לבחור קובץ PDF');
      return;
    }
    if (kind === 'original') setOriginalFile(file);
    else setRevisedFile(file);
  };

  const confirmCreate = async () => {
    if (!originalFile || !revisedFile) return;
    const comparison = createEmptyComparison(name || 'השוואת תוכניות', apartmentNumber, originalFile.name, revisedFile.name);
    await saveComparePdfBlob(comparison.id, 'original', originalFile);
    await saveComparePdfBlob(comparison.id, 'revised', revisedFile);
    await saveComparison(comparison);
    setCreating(false);
    setOriginalFile(null);
    setRevisedFile(null);
    setName('');
    setApartmentNumber('');
    setComparison(comparison);
  };

  return (
    <div className="start-screen">
      <div className="start-hero">
        <h1>השוואת תוכניות</h1>
        <p>העלה תוכנית מקור ותוכנית מעודכנת של אותה דירה כדי להשוות ביניהן ולזהות שינויים</p>
        <button className="btn-primary large" onClick={() => setCreating(true)}>
          + השוואה חדשה
        </button>
      </div>

      <div className="project-list-section">
        <h3>השוואות שמורות</h3>
        {loading && <p className="muted">טוען…</p>}
        {!loading && comparisons.length === 0 && <p className="muted">אין עדיין השוואות שמורות.</p>}
        <ul className="project-list">
          {comparisons.map((c) => (
            <li key={c.id} onClick={() => openComparison(c)}>
              <div className="project-list-name">{c.name}</div>
              <div className="project-list-meta">
                {c.apartmentNumber ? `דירה ${c.apartmentNumber} · ` : ''}
                {c.markups.length} סימונים · עודכן {new Date(c.updatedAt).toLocaleDateString('he-IL')}
              </div>
              <button className="icon-btn danger" onClick={(e) => handleDelete(e, c.id)} title="מחק">
                ✕
              </button>
            </li>
          ))}
        </ul>
      </div>

      {creating && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>השוואה חדשה</h3>
            <div className="form-row">
              <label>שם ההשוואה</label>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="לדוגמה: דירה 5 - שינויי דיירים" />
            </div>
            <div className="form-row">
              <label>מספר דירה</label>
              <input value={apartmentNumber} onChange={(e) => setApartmentNumber(e.target.value)} />
            </div>
            <div className="form-row">
              <label>תוכנית מקור (Original)</label>
              <button className="btn-secondary" onClick={() => originalInputRef.current?.click()}>
                {originalFile ? `✓ ${originalFile.name}` : 'בחר קובץ PDF'}
              </button>
              <input
                ref={originalInputRef}
                type="file"
                accept="application/pdf,.pdf"
                hidden
                onChange={(e) => {
                  pickPdf(e.target.files?.[0], 'original');
                  e.target.value = '';
                }}
              />
            </div>
            <div className="form-row">
              <label>תוכנית מעודכנת (Revised)</label>
              <button className="btn-secondary" onClick={() => revisedInputRef.current?.click()}>
                {revisedFile ? `✓ ${revisedFile.name}` : 'בחר קובץ PDF'}
              </button>
              <input
                ref={revisedInputRef}
                type="file"
                accept="application/pdf,.pdf"
                hidden
                onChange={(e) => {
                  pickPdf(e.target.files?.[0], 'revised');
                  e.target.value = '';
                }}
              />
            </div>
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setCreating(false);
                  setOriginalFile(null);
                  setRevisedFile(null);
                }}
              >
                ביטול
              </button>
              <button className="btn-primary" onClick={confirmCreate} disabled={!originalFile || !revisedFile}>
                צור השוואה
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
