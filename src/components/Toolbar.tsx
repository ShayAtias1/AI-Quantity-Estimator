import { useAppStore } from '../store/appStore';
import type { ToolMode } from '../types';
import { isPageCalibrated } from '../lib/quantities';
import Icon, { type IconName } from './Icon';

/** Canvas tools, in workflow order. Separators mark the three groups: view · scale · draw. */
const NAVIGATE_TOOLS: { mode: ToolMode; label: string; icon: IconName; hint: string }[] = [
  { mode: 'select', label: 'בחירה', icon: 'select', hint: 'בחירה — בחירה והזזת נקודות' },
  { mode: 'pan', label: 'הזזה', icon: 'pan', hint: 'הזזה — גרירת התצוגה' },
];

const DRAW_TOOLS: { mode: ToolMode; label: string; icon: IconName; hint: string }[] = [
  { mode: 'draw', label: 'סימון חדר', icon: 'polygon', hint: 'סימון חדר — פוליגון' },
  { mode: 'draw-rect', label: 'מלבן', icon: 'rectangle', hint: 'סימון חדר — מלבן, שתי פינות נגדיות' },
];

export default function Toolbar() {
  const project = useAppStore((s) => s.project);
  const currentPage = useAppStore((s) => s.currentPage);
  const toolMode = useAppStore((s) => s.toolMode);
  const setToolMode = useAppStore((s) => s.setToolMode);
  const drawingPoints = useAppStore((s) => s.drawingPoints);
  const finishDrawing = useAppStore((s) => s.finishDrawing);
  const clearDrawingPoints = useAppStore((s) => s.clearDrawingPoints);

  const calibrated = !!project && isPageCalibrated(project, currentPage);

  // The rail is icon-only: the name of the tool is its tooltip and its accessible name, which is
  // what lets the rail come down to 56px without losing anything.
  const toolButton = (t: { mode: ToolMode; label: string; icon: IconName; hint: string }) => (
    <button
      key={t.mode}
      className={`tool-btn ${toolMode === t.mode ? 'active' : ''}`}
      title={t.hint}
      aria-label={t.label}
      aria-pressed={toolMode === t.mode}
      onClick={() => setToolMode(t.mode)}
    >
      <Icon name={t.icon} size={20} />
    </button>
  );

  return (
    <div className="toolbar">
      {NAVIGATE_TOOLS.map(toolButton)}

      <span className="toolbar-sep" />

      {/* Calibration is a canvas tool and lives with the others. "Needs a scale" is a dot, not a
          background: the tool can be active AND flagged at the same time, which the old
          background override made impossible. */}
      <button
        className={`tool-btn ${toolMode === 'calibrate' ? 'active' : ''}`}
        title={calibrated ? 'כיול — כיול מחדש של קנה המידה בעמוד זה' : 'כיול — העמוד אינו מכויל, לא ניתן לחשב כמויות'}
        aria-label="כיול קנה מידה"
        aria-pressed={toolMode === 'calibrate'}
        onClick={() => setToolMode(toolMode === 'calibrate' ? 'select' : 'calibrate')}
      >
        <Icon name="ruler" size={20} />
        {!calibrated && <span className="tool-attention-dot" />}
      </button>

      <span className="toolbar-sep" />

      {DRAW_TOOLS.map(toolButton)}

      {toolMode === 'calibrate' && <div className="draw-hint">לחץ שתי נקודות שהמרחק ביניהן ידוע</div>}

      {toolMode === 'draw' && drawingPoints.length > 0 && (
        <div className="draw-hint">
          {drawingPoints.length} נקודות · {drawingPoints.length >= 3 ? 'לחץ על הנקודה הראשונה או Enter לסגירה' : 'לחץ להוספת נקודות'}
          <button className="btn-ghost small" onClick={() => clearDrawingPoints()}>
            נקה
          </button>
          {drawingPoints.length >= 3 && (
            <button className="btn-primary small" onClick={() => finishDrawing()}>
              סגור אזור
            </button>
          )}
        </div>
      )}

      {toolMode === 'draw-rect' && (
        <div className="draw-hint">
          {drawingPoints.length === 0 ? 'לחץ על פינה אחת של המלבן' : 'לחץ על הפינה הנגדית לסגירה'}
          {drawingPoints.length > 0 && (
            <button className="btn-ghost small" onClick={() => clearDrawingPoints()}>
              נקה
            </button>
          )}
        </div>
      )}
    </div>
  );
}
