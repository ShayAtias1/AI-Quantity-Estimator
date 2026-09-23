import { useEffect, useRef, useState } from 'react';
import { useCompareStore, createEmptyComparison } from '../../store/compareStore';
import { deleteComparison, listComparisons, saveComparePdfBlob, saveComparison } from '../../db/database';
import type { Comparison } from '../../types/compare';
import SavedItemList, { type SavedItem } from '../SavedItemList';
import Icon from '../Icon';

/** What the row says about a comparison: which flat, how many revised plans, when it was touched. */
function comparisonMeta(c: Comparison): string {
  const parts: string[] = [];
  if (c.apartmentNumber) parts.push(`דירה ${c.apartmentNumber}`);
  parts.push(c.revisions.length === 1 ? 'גרסה אחת' : `${c.revisions.length} גרסאות`);
  parts.push(`עודכן ${new Date(c.updatedAt).toLocaleDateString('he-IL')}`);
  return parts.join(' · ');
}

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

  const handleDelete = async (id: string) => {
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
    if (!name.trim()) setName(file.name.replace(/\.pdf$/i, ''));
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

  const closeDialog = () => {
    setCreating(false);
    setOriginalFile(null);
    setRevisedFiles([]);
    setName('');
    setApartmentNumber('');
  };

  const confirmCreate = async () => {
    if (!originalFile) return;
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
    closeDialog();
    setComparison(comparison);
  };

  const items: SavedItem[] = comparisons.map((c) => ({ id: c.id, name: c.name, meta: comparisonMeta(c) }));

  return (
    <div className="home-panel">
      <div className="home-panel-head">
        <div className="home-panel-text">
          <h2>השוואת תוכניות</h2>
          <p className="muted">השוואת תוכנית מקור מול גרסאות מעודכנות, וסימון ההריסה והבנייה החדשה.</p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          <Icon name="plus" />
          השוואה חדשה
        </button>
      </div>

      <span className="section-label">השוואות שמורות</span>
      <SavedItemList
        items={items}
        icon="layers"
        loading={loading}
        emptyText="אין עדיין השוואות שמורות. צור השוואה חדשה מתוכנית מקור ומתוכנית מעודכנת."
        onOpen={(id) => {
          const comparison = comparisons.find((c) => c.id === id);
          if (comparison) setComparison(comparison);
        }}
        onDelete={(id) => void handleDelete(id)}
        openTitle="פתח את ההשוואה"
        deleteTitle="מחק השוואה"
      />

      {creating && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>השוואה חדשה</h3>
            <div className="form-row">
              <label>שם ההשוואה</label>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="לדוגמה: דירה 5 — שינויי דיירים" />
            </div>
            <div className="form-row">
              <label>מספר דירה</label>
              <input value={apartmentNumber} onChange={(e) => setApartmentNumber(e.target.value)} />
            </div>
            <div className="form-row">
              <label>תוכנית מקור (PDF)</label>
              <button className="btn-secondary file-pick" onClick={() => originalInputRef.current?.click()}>
                <Icon name={originalFile ? 'check' : 'file'} />
                {originalFile ? originalFile.name : 'בחר קובץ PDF'}
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
              <label>תוכניות מעודכנות — אופציונלי, ניתן להוסיף גם מאוחר יותר</label>
              <button className="btn-secondary file-pick" onClick={() => revisedInputRef.current?.click()}>
                <Icon name="plus" />
                הוסף קובץ PDF
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
                      <Icon name="file" />
                      <span className="picked-file-name">{f.name}</span>
                      <button className="icon-btn danger" title="הסר קובץ" onClick={() => removeRevisedFile(i)}>
                        <Icon name="trash" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={closeDialog}>
                ביטול
              </button>
              <button className="btn-primary" onClick={confirmCreate} disabled={!originalFile}>
                צור השוואה
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
