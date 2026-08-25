import { useState } from 'react';

/**
 * Editor for a text-note markup: a multi-line box (window.prompt only ever gave one line) plus the
 * note's orientation. Used for both new notes and editing an existing one.
 */
export default function TextNoteDialog({
  initialText = '',
  initialRotation = 0,
  onSubmit,
  onCancel,
}: {
  initialText?: string;
  initialRotation?: number;
  onSubmit: (text: string, rotationDeg: number) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initialText);
  const [rotated, setRotated] = useState(initialRotation !== 0);

  const submit = () => {
    const trimmed = text.replace(/\s+$/, '');
    if (!trimmed.trim()) {
      onCancel();
      return;
    }
    onSubmit(trimmed, rotated ? -90 : 0);
  };

  return (
    // The dialog sits inside the plan viewport, so its clicks must not reach the canvas underneath —
    // otherwise saving or cancelling would immediately open another note where the button was.
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="modal text-note-modal">
        <h3>הערת טקסט</h3>
        <textarea
          autoFocus
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') onCancel();
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();
          }}
          placeholder={'אפשר לכתוב כמה שורות.\nEnter יורד שורה, Ctrl+Enter שומר.'}
        />
        <label className="source-color-toggle">
          <input type="checkbox" checked={rotated} onChange={(e) => setRotated(e.target.checked)} />
          סובב את ההערה ב-90°
        </label>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel}>
            ביטול
          </button>
          <button className="btn-primary" onClick={submit} disabled={!text.trim()}>
            שמור
          </button>
        </div>
      </div>
    </div>
  );
}
