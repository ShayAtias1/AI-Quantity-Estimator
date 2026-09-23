import { useAppStore } from '../store/appStore';
import { MARKUP_TOOL_LABELS, type MarkupTool } from '../types';
import Icon, { type IconName } from './Icon';

const MARKUP_TOOLS: MarkupTool[] = ['cloud', 'arrow', 'rectangle', 'text', 'dimension', 'mask'];
const MARKUP_ICONS: Record<MarkupTool, IconName> = {
  cloud: 'cloud',
  arrow: 'arrow',
  rectangle: 'rectangle',
  text: 'text',
  dimension: 'dimension',
  mask: 'mask',
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
  const markupOrtho = useAppStore((s) => s.markupOrtho);
  const setMarkupOrtho = useAppStore((s) => s.setMarkupOrtho);
  const deleteMarkup = useAppStore((s) => s.deleteMarkup);
  const duplicateMarkup = useAppStore((s) => s.duplicateMarkup);
  const selectedMarkupId = useAppStore((s) => s.selectedMarkupId);
  const setSelectedMarkupId = useAppStore((s) => s.setSelectedMarkupId);
  const markupFontScale = useAppStore((s) => s.markupFontScale);
  const setMarkupFontScale = useAppStore((s) => s.setMarkupFontScale);
  const updateMarkup = useAppStore((s) => s.updateMarkup);
  const updateMarkupQuiet = useAppStore((s) => s.updateMarkupQuiet);

  if (!project) return null;
  const pageMarkups = (project.markups ?? []).filter((m) => m.pageNumber === currentPage);

  const sizeTargetMarkup = pageMarkups.find((m) => m.id === selectedMarkupId && (m.tool === 'text' || m.tool === 'dimension'));
  const selectedTextMarkup = pageMarkups.find((m) => m.id === selectedMarkupId && m.tool === 'text');
  const selectedDimension = pageMarkups.find((m) => m.id === selectedMarkupId && m.tool === 'dimension');
  const activeFontScale = sizeTargetMarkup ? sizeTargetMarkup.fontScale ?? 1 : markupFontScale;
  const applyFontScale = (v: number) => {
    if (sizeTargetMarkup) updateMarkup(sizeTargetMarkup.id, { fontScale: v });
    else setMarkupFontScale(v);
  };

  // The drawing hint for whichever tool is active: a single short line, with the long form kept
  // as its tooltip. Null when no markup tool is in use, so the panel stays quiet.
  const hint: { short: string; long?: string } | null =
    toolMode !== 'markup' || !markupTool
      ? null
      : markupTool === 'cloud'
        ? { short: `לחץ נקודות וסגור ליד הראשונה (${markupPoints.length})` }
        : markupTool === 'arrow' || markupTool === 'rectangle'
          ? { short: 'לחץ נקודת התחלה וסיום' }
          : markupTool === 'mask'
            ? {
                short: 'לחץ פינת התחלה וסיום למלבן מסתיר',
                long: 'לחץ פינת התחלה וסיום למלבן שיסתיר את מה שמתחתיו. נוצר בלבן — אפשר לשנות את הצבע אחר כך.',
              }
            : markupTool === 'dimension'
              ? {
                  short: `לחץ התחלה וסיום; כל לחיצה נוספת ממשיכה את הקו (${Math.max(0, markupPoints.length - 1)})`,
                  long: 'לחץ נקודת התחלה וסיום, וכל לחיצה נוספת ממשיכה מידה על אותו קו. סיום: Enter, לחיצה כפולה או לחיצה על העצירה האחרונה. ביטול: Esc.',
                }
              : {
                  short: 'לחץ במקום להוספת הערה',
                  long: 'לחץ במקום להוספת הערה. נפתח חלון לכתיבת מספר שורות. לעריכה: לחיצה כפולה על ההערה בכלי הבחירה.',
                };

  // The colour swatches recolour the selected markup when there is one, so any markup can be
  // recoloured after it was drawn; with nothing selected they set the colour for new markups.
  const selectedMarkup = pageMarkups.find((m) => m.id === selectedMarkupId);
  const activeColor = selectedMarkup ? selectedMarkup.color : markupColor;
  const applyColor = (c: string) => {
    if (selectedMarkup) updateMarkup(selectedMarkup.id, { color: c });
    else setMarkupColor(c);
  };

  return (
    <div className="markup-toolbar">
      <h4>סימונים</h4>

      <div className="markup-color-row" title={selectedMarkup ? 'משנה את הצבע של הסימון שנבחר' : 'צבע לסימונים חדשים — בחר סימון קיים כדי לשנות את הצבע שלו'}>
        <span className="section-label">{selectedMarkup ? 'צבע הסימון' : 'צבע'}</span>
        <div className="tint-swatches">
          {MARKUP_COLORS.map((c) => (
            <button
              key={c}
              className={`tint-swatch ${c === activeColor ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => applyColor(c)}
              title={c}
            />
          ))}
        </div>
        <input
          type="color"
          className="markup-color-input"
          value={activeColor}
          onChange={(e) => applyColor(e.target.value)}
          title="צבע חופשי"
        />
      </div>

      <span className="section-label">כלי סימון</span>
      <div className="markup-tool-grid segmented">
        {MARKUP_TOOLS.map((t) => (
          <button
            key={t}
            className={`tool-btn ${toolMode === 'markup' && markupTool === t ? 'active' : ''}`}
            aria-pressed={toolMode === 'markup' && markupTool === t}
            onClick={() => setMarkupTool(markupTool === t ? null : t)}
          >
            <Icon name={MARKUP_ICONS[t]} />
            <span className="tool-label">{MARKUP_TOOL_LABELS[t]}</span>
          </button>
        ))}
      </div>

      {/* Text-note / dimension-label size: edits the selected note when one is selected, otherwise sets the default for new ones. */}
      <div className="markup-size-row" title={sizeTargetMarkup ? 'משנה את גודל ההערה שנבחרה' : 'גודל ברירת מחדל להערות טקסט ולקווי מידה חדשים'}>
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
          <Icon name="reset" />
        </button>
      </div>

      {/* Orientation of the selected text note; double-clicking a note on the plan reopens its editor. */}
      {selectedTextMarkup && (
        <button
          className="btn-secondary small"
          onClick={() => updateMarkup(selectedTextMarkup.id, { rotationDeg: selectedTextMarkup.rotationDeg ? 0 : -90 })}
        >
          <Icon name="rotate" />
          {selectedTextMarkup.rotationDeg ? 'החזר את ההערה לאופקי' : 'סובב את ההערה ב-90°'}
        </button>
      )}

      {/* Mirrors the selected dimension about its own line: values and the overall line swap sides. */}
      {selectedDimension && (
        <button className="btn-secondary small" onClick={() => updateMarkup(selectedDimension.id, { flipped: !selectedDimension.flipped })}>
          <Icon name="flip" />
          הפוך את המידה לצד השני
        </button>
      )}

      {toolMode === 'markup' && (markupTool === 'dimension' || markupTool === 'arrow' || markupTool === 'cloud') && (
        <label className="source-color-toggle">
          <input type="checkbox" checked={markupOrtho} onChange={(e) => setMarkupOrtho(e.target.checked)} />
          קווים ישרים בלבד (90°)
        </label>
      )}

      {/* One short hint at a time for the active tool. The full instructions — the three-line
          dimension explanation in particular — are the tooltip, instead of five paragraphs
          stacking up in the panel. */}
      {hint && (
        <p className="tool-hint" title={hint.long ?? hint.short}>
          <Icon name="alert" size={13} />
          {hint.short}
        </p>
      )}

      {pageMarkups.length === 0 ? (
        <div className="empty-state">
          <Icon name="cloud" size={24} />
          <p>אין עדיין סימונים בעמוד זה. בחר כלי סימון למעלה וסמן על התוכנית.</p>
        </div>
      ) : (
        <ul className="measurement-list">
          {pageMarkups.map((m) => (
            <li
              key={m.id}
              className={m.id === selectedMarkupId ? 'selected' : ''}
              onClick={() => setSelectedMarkupId(m.id === selectedMarkupId ? null : m.id)}
            >
              <span>
                <input
                  type="color"
                  className="markup-color-input"
                  value={m.color}
                  onClick={(e) => e.stopPropagation()}
                  // The OS picker streams changes while it's open: preview them, commit once on close.
                  onChange={(e) => updateMarkupQuiet(m.id, { color: e.target.value })}
                  onBlur={() => updateMarkup(m.id, {})}
                  title="שנה צבע"
                />{' '}
                {MARKUP_TOOL_LABELS[m.tool]}
                {m.text ? (m.tool === 'dimension' ? `: ${m.text} ס"מ` : `: ${m.text}`) : ''}
              </span>
              <span className="list-item-actions">
                <button className="icon-btn" title="שכפל" onClick={(e) => { e.stopPropagation(); duplicateMarkup(m.id); }}>
                  <Icon name="copy" />
                </button>
                <button className="icon-btn danger" title="מחק" onClick={(e) => { e.stopPropagation(); deleteMarkup(m.id); }}>
                  <Icon name="trash" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
