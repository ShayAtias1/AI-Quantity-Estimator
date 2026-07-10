import { useCompareStore } from '../../store/compareStore';
import { MARKUP_TOOL_LABELS, type MarkupTool } from '../../types/compare';

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
  const comparison = useCompareStore((s) => s.comparison);
  const toolMode = useCompareStore((s) => s.toolMode);
  const markupTool = useCompareStore((s) => s.markupTool);
  const setMarkupTool = useCompareStore((s) => s.setMarkupTool);
  const markupPoints = useCompareStore((s) => s.markupPoints);
  const markupColor = useCompareStore((s) => s.markupColor);
  const setMarkupColor = useCompareStore((s) => s.setMarkupColor);
  const deleteMarkup = useCompareStore((s) => s.deleteMarkup);

  if (!comparison) return null;
  const activeRevision = comparison.revisions.find((r) => r.id === comparison.activeRevisionId);
  const markups = activeRevision?.markups ?? [];

  return (
    <div className="markup-toolbar">
      <h4>סימוני שינויים</h4>

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

      {toolMode === 'markup' && markupTool === 'cloud' && (
        <p className="alignment-hint">לחץ נקודות ולסגור ליד הנקודה הראשונה ({markupPoints.length} נקודות)</p>
      )}
      {toolMode === 'markup' && (markupTool === 'arrow' || markupTool === 'rectangle' || markupTool === 'dimension') && (
        <p className="alignment-hint">לחץ נקודת התחלה וסיום</p>
      )}
      {toolMode === 'markup' && markupTool === 'text' && <p className="alignment-hint">לחץ במקום להוספת הערה</p>}

      {markups.length > 0 && (
        <ul className="measurement-list">
          {markups.map((m) => (
            <li key={m.id}>
              <span>
                <span className="color-dot" style={{ background: m.color }} /> {MARKUP_TOOL_LABELS[m.tool]}
                {m.text ? `: ${m.text}` : ''}
              </span>
              <button className="icon-btn danger" onClick={() => deleteMarkup(m.id)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
