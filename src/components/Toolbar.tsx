import { useAppStore } from '../store/appStore';
import type { ToolMode } from '../types';

const TOOLS: { mode: ToolMode; label: string; icon: string; hint: string }[] = [
  { mode: 'select', label: 'בחירה', icon: '⭤', hint: 'בחירה והזזת נקודות' },
  { mode: 'pan', label: 'הזזה', icon: '✋', hint: 'גרירת התצוגה' },
  { mode: 'calibrate', label: 'כיול', icon: '📏', hint: 'סימון מרחק ידוע' },
  { mode: 'draw', label: 'סימון אזור', icon: '✏️', hint: 'סימון פוליגון חדש' },
];

export default function Toolbar() {
  const toolMode = useAppStore((s) => s.toolMode);
  const setToolMode = useAppStore((s) => s.setToolMode);
  const drawingPoints = useAppStore((s) => s.drawingPoints);
  const finishDrawing = useAppStore((s) => s.finishDrawing);
  const clearDrawingPoints = useAppStore((s) => s.clearDrawingPoints);

  return (
    <div className="toolbar">
      {TOOLS.map((t) => (
        <button
          key={t.mode}
          className={`tool-btn ${toolMode === t.mode ? 'active' : ''}`}
          title={t.hint}
          onClick={() => setToolMode(t.mode)}
        >
          <span className="tool-icon">{t.icon}</span>
          <span className="tool-label">{t.label}</span>
        </button>
      ))}

      {toolMode === 'draw' && drawingPoints.length > 0 && (
        <div className="draw-hint">
          {drawingPoints.length} נקודות · {drawingPoints.length >= 3 ? 'לחץ על הנקודה הראשונה או Enter לסגירה' : 'לחץ להוספת נקודות'}
          <button className="btn-secondary small" onClick={() => clearDrawingPoints()}>
            נקה
          </button>
          {drawingPoints.length >= 3 && (
            <button className="btn-primary small" onClick={() => finishDrawing()}>
              סגור אזור
            </button>
          )}
        </div>
      )}
    </div>
  );
}
