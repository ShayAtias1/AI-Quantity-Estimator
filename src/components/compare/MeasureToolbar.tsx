import { useCompareStore } from '../../store/compareStore';
import { MEASURE_TOOL_LABELS, type MeasureTool } from '../../types/compare';

const MEASURE_TOOLS: MeasureTool[] = ['distance', 'area', 'perimeter'];
const MEASURE_ICONS: Record<MeasureTool, string> = { distance: '📏', area: '⬛', perimeter: '⭕' };

export default function MeasureToolbar() {
  const comparison = useCompareStore((s) => s.comparison);
  const currentPageKey = useCompareStore((s) => s.currentPageKey);
  const toolMode = useCompareStore((s) => s.toolMode);
  const measureTool = useCompareStore((s) => s.measureTool);
  const setMeasureTool = useCompareStore((s) => s.setMeasureTool);
  const measurePoints = useCompareStore((s) => s.measurePoints);
  const startCalibration = useCompareStore((s) => s.startCalibration);
  const deleteMeasurement = useCompareStore((s) => s.deleteMeasurement);

  if (!comparison) return null;
  const page = comparison.pages[currentPageKey];
  const hasCalibration = !!(page?.originalCalibration || page?.revisedCalibration);

  return (
    <div className="measure-toolbar">
      <h4>כיול ומדידה</h4>

      <div className="calibration-status">
        {hasCalibration ? (
          <span className="cal-ok">✓ קנה מידה כויל בעמוד זה</span>
        ) : (
          <span className="cal-missing">יש לכייל קנה מידה לפני מדידה</span>
        )}
      </div>
      <div className="work-item-add-row">
        <button className="btn-secondary small" onClick={() => startCalibration('original')}>
          📏 כיול לפי מקור
        </button>
        <button className="btn-secondary small" onClick={() => startCalibration('revised')}>
          📏 כיול לפי מעודכן
        </button>
      </div>

      <div className="work-item-add-row">
        {MEASURE_TOOLS.map((t) => (
          <button
            key={t}
            className={`tool-btn small-tool ${toolMode === 'measure' && measureTool === t ? 'active' : ''}`}
            onClick={() => setMeasureTool(measureTool === t ? null : t)}
          >
            <span className="tool-icon">{MEASURE_ICONS[t]}</span>
            <span className="tool-label">{MEASURE_TOOL_LABELS[t]}</span>
          </button>
        ))}
      </div>
      {toolMode === 'measure' && measureTool && (
        <p className="alignment-hint">
          {measureTool === 'distance'
            ? 'לחץ 2 נקודות כדי למדוד מרחק'
            : `לחץ נקודות ולסגור ליד הנקודה הראשונה (${measurePoints.length} נקודות)`}
        </p>
      )}

      {comparison.measurements.length > 0 && (
        <ul className="measurement-list">
          {comparison.measurements.map((m) => (
            <li key={m.id}>
              <span>
                {MEASURE_TOOL_LABELS[m.tool]}: <strong>{m.label}</strong>
              </span>
              <button className="icon-btn danger" onClick={() => deleteMeasurement(m.id)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
