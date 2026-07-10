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
  const [revisedFiles, setRevisedFiles] = useState<File[]>([]);
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

  const isPdf = (file: File) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  const pickOriginal = (file: File | null | undefined) => {
    if (!file) return;
    if (!isPdf(file)) {
      alert('נא לבחור קובץ PDF');
      return;
    }
    setOriginalFile(file);
  };

  const pickRevised = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const picked = Array.from(files);
    if (picked.some((f) => !isPdf(f))) {
      alert('נא לבחור קבצי PDF בלבד');
      return;
    }
    setRevisedFiles((prev) => [...prev, ...picked]);
  };

  const removeRevisedFile = (index: number) => {
    setRevisedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const confirmCreate = async () => {
    if (!originalFile || revisedFiles.length === 0) return;
    const comparison = createEmptyComparison(
      name || 'השוואת תוכניות',
      apartmentNumber,
      originalFile.name,
      revisedFiles.map((f) => f.name)
    );
    await saveComparePdfBlob(comparison.id, 'original', originalFile);
    await Promise.all(
      comparison.revisions.map((rev, i) => saveComparePdfBlob(comparison.id, `revision:${rev.id}`, revisedFiles[i]))
    );
    await saveComparison(comparison);
    setCreating(false);
    setOriginalFile(null);
    setRevisedFiles([]);
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
                  pickOriginal(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>
            <div className="form-row">
              <label>תוכניות מעודכנות (Revised) — ניתן לבחור כמה תוכניות</label>
              <button className="btn-secondary" onClick={() => revisedInputRef.current?.click()}>
                + הוסף קובץ PDF
              </button>
              <input
                ref={revisedInputRef}
                type="file"
                accept="application/pdf,.pdf"
                multiple
                hidden
                onChange={(e) => {
                  pickRevised(e.target.files);
                  e.target.value = '';
                }}
              />
              {revisedFiles.length > 0 && (
                <ul className="picked-file-list">
                  {revisedFiles.map((f, i) => (
                    <li key={i}>
                      <span>✓ {f.name}</span>
                      <button className="icon-btn danger" onClick={() => removeRevisedFile(i)}>
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setCreating(false);
                  setOriginalFile(null);
                  setRevisedFiles([]);
                }}
              >
                ביטול
              </button>
              <button className="btn-primary" onClick={confirmCreate} disabled={!originalFile || revisedFiles.length === 0}>
                צור השוואה
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
