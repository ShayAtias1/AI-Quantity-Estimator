import { useAppStore } from '../store/appStore';
import { MARKUP_TOOL_LABELS, type MarkupTool } from '../types';

const MARKUP_TOOLS: MarkupTool[] = ['cloud', 'arrow', 'rectangle', 'text', 'dimension'];
const MARKUP_ICONS: Record<MarkupTool, string> = {
  cloud: '☁️',
  arrow: '➤',
  rectangle: '▭',
  text: '💬',
  dimension: '📐',
};

const MARKUP_COLORS = ['#ef4444', '#f59e0b', '#16a34a', '#2563eb', '#9333ea', '#0f172a'];

export default function MarkupToolbar() {
  const project = useAppStore((s) => s.project);
  const currentPage = useAppStore((s) => s.currentPage);
  const toolMode = useAppStore((s) => s.toolMode);
  const markupTool = useAppStore((s) => s.markupTool);
  const setMarkupTool = useAppStore((s) => s.setMarkupTool);
  const markupPoints = useAppStore((s) => s.markupPoints);
  const markupColor = useAppStore((s) => s.markupColor);
  const setMarkupColor = useAppStore((s) => s.setMarkupColor);
  const deleteMarkup = useAppStore((s) => s.deleteMarkup);
  const duplicateMarkup = useAppStore((s) => s.duplicateMarkup);
  const selectedMarkupId = useAppStore((s) => s.selectedMarkupId);
  const setSelectedMarkupId = useAppStore((s) => s.setSelectedMarkupId);
  const markupFontScale = useAppStore((s) => s.markupFontScale);
  const setMarkupFontScale = useAppStore((s) => s.setMarkupFontScale);
  const updateMarkup = useAppStore((s) => s.updateMarkup);

  if (!project) return null;
  const pageMarkups = (project.markups ?? []).filter((m) => m.pageNumber === currentPage);

  const sizeTargetMarkup = pageMarkups.find((m) => m.id === selectedMarkupId && (m.tool === 'text' || m.tool === 'dimension'));
  const activeFontScale = sizeTargetMarkup ? sizeTargetMarkup.fontScale ?? 1 : markupFontScale;
  const applyFontScale = (v: number) => {
    if (sizeTargetMarkup) updateMarkup(sizeTargetMarkup.id, { fontScale: v });
    else setMarkupFontScale(v);
  };

  return (
    <div className="markup-toolbar">
      <h4>סימונים</h4>

      <div className="tint-swatches">
        {MARKUP_COLORS.map((c) => (
          <button
            key={c}
            className={`tint-swatch ${c === markupColor ? 'active' : ''}`}
            style={{ background: c }}
            onClick={() => setMarkupColor(c)}
            title={c}
          />
        ))}
      </div>

      <div className="markup-tool-grid">
        {MARKUP_TOOLS.map((t) => (
          <button
            key={t}
            className={`tool-btn small-tool ${toolMode === 'markup' && markupTool === t ? 'active' : ''}`}
            onClick={() => setMarkupTool(markupTool === t ? null : t)}
          >
            <span className="tool-icon">{MARKUP_ICONS[t]}</span>
            <span className="tool-label">{MARKUP_TOOL_LABELS[t]}</span>
          </button>
        ))}
      </div>

      {/* Text-note / dimension-label size: edits the selected note when one is selected, otherwise sets the default for new ones. */}
      <div className="markup-size-row">
        <label>גודל טקסט {Math.round(activeFontScale * 100)}%</label>
        <input
          type="range"
          min={0.4}
          max={2.5}
          step={0.05}
          value={activeFontScale}
          onChange={(e) => applyFontScale(parseFloat(e.target.value))}
        />
        <button className="icon-btn" title="חזרה לגודל ברירת המחדל" onClick={() => applyFontScale(1)}>
          ↺
        </button>
      </div>
      <p className="alignment-hint">
        {sizeTargetMarkup ? 'משנה את גודל ההערה שנבחרה' : 'גודל ברירת מחדל להערות טקסט ולקווי מידה חדשים'}
      </p>

      {toolMode === 'markup' && markupTool === 'cloud' && (
        <p className="alignment-hint">לחץ נקודות ולסגור ליד הנקודה הראשונה ({markupPoints.length} נקודות)</p>
      )}
      {toolMode === 'markup' && (markupTool === 'arrow' || markupTool === 'rectangle' || markupTool === 'dimension') && (
        <p className="alignment-hint">לחץ נקודת התחלה וסיום</p>
      )}
      {toolMode === 'markup' && markupTool === 'text' && <p className="alignment-hint">לחץ במקום להוספת הערה</p>}

      {pageMarkups.length === 0 ? (
        <p className="muted">אין עדיין סימונים בעמוד זה.</p>
      ) : (
        <ul className="measurement-list">
          {pageMarkups.map((m) => (
            <li
              key={m.id}
              className={m.id === selectedMarkupId ? 'selected' : ''}
              onClick={() => setSelectedMarkupId(m.id === selectedMarkupId ? null : m.id)}
            >
              <span>
                <span className="color-dot" style={{ background: m.color }} /> {MARKUP_TOOL_LABELS[m.tool]}
                {m.text ? `: ${m.text}` : ''}
              </span>
              <span className="list-item-actions">
                <button className="icon-btn" title="שכפל" onClick={(e) => { e.stopPropagation(); duplicateMarkup(m.id); }}>
                  ⧉
                </button>
                <button className="icon-btn danger" title="מחק" onClick={(e) => { e.stopPropagation(); deleteMarkup(m.id); }}>
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
