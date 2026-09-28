import { useRef, useState } from 'react';
import Icon from '../Icon';

export interface NewComparisonInput {
  name: string;
  apartmentNumber: string;
  original: File;
  revised: File[];
}

/**
 * The "new revision comparison" dialog: name, apartment, the original plan and any revised plans.
 * Opened from a project's overview; creating files the comparison under that project.
 */
export default function NewComparisonDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: NewComparisonInput) => Promise<void>;
}) {
  const originalInputRef = useRef<HTMLInputElement>(null);
  const revisedInputRef = useRef<HTMLInputElement>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [revisedFiles, setRevisedFiles] = useState<File[]>([]);
  const [name, setName] = useState('');
  const [apartmentNumber, setApartmentNumber] = useState('');

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

  const confirmCreate = async () => {
    if (!originalFile) return;
    onClose();
    await onCreate({ name: name.trim() || 'השוואת תוכניות', apartmentNumber, original: originalFile, revised: revisedFiles });
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>השוואה חדשה</h3>
        <div className="form-row">
          <label>שם ההשוואה</label>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="לדוגמה: היתר מקורי מול גרסה 01" />
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
          <button className="btn-secondary" onClick={onClose}>
            ביטול
          </button>
          <button className="btn-primary" onClick={() => void confirmCreate()} disabled={!originalFile}>
            צור השוואה
          </button>
        </div>
      </div>
    </div>
  );
}
