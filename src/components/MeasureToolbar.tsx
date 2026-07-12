import { useAppStore } from '../store/appStore';
import { MEASURE_TOOL_LABELS, type AreaShape, type MeasureTool } from '../types';

const MEASURE_TOOLS: MeasureTool[] = ['distance', 'area', 'perimeter'];
const MEASURE_ICONS: Record<MeasureTool, string> = { distance: '📏', area: '⬛', perimeter: '⭕' };
const AREA_SHAPES: { shape: AreaShape; label: string; icon: string }[] = [
  { shape: 'polygon', label: 'פוליגון', icon: '⬠' },
  { shape: 'rectangle', label: 'מלבן', icon: '▭' },
];

export default function MeasureToolbar() {
  const project = useAppStore((s) => s.project);
  const currentPage = useAppStore((s) => s.currentPage);
  const toolMode = useAppStore((s) => s.toolMode);
  const measureTool = useAppStore((s) => s.measureTool);
  const setMeasureTool = useAppStore((s) => s.setMeasureTool);
  const measurePoints = useAppStore((s) => s.measurePoints);
  const areaShape = useAppStore((s) => s.areaShape);
  const setAreaShape = useAppStore((s) => s.setAreaShape);
  const orthoSnap = useAppStore((s) => s.orthoSnap);
  const setOrthoSnap = useAppStore((s) => s.setOrthoSnap);
  const deleteMeasurement = useAppStore((s) => s.deleteMeasurement);

  if (!project) return null;
  const hasCalibration = !!project.pages[currentPage]?.calibration;
  const pageMeasurements = (project.measurements ?? []).filter((m) => m.pageNumber === currentPage);

  return (
    <div className="measure-toolbar">
      <h4>מדידה</h4>

      <div className="calibration-status">
        {hasCalibration ? (
          <span className="cal-ok">✓ קנה מידה כויל בעמוד זה</span>
        ) : (
          <span className="cal-missing">יש לכייל קנה מידה (כלי "כיול") לפני מדידה</span>
        )}
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

      {toolMode === 'measure' && measureTool === 'area' && (
        <div className="work-item-add-row">
          {AREA_SHAPES.map(({ shape, label, icon }) => (
            <button
              key={shape}
              className={`tool-btn small-tool ${areaShape === shape ? 'active' : ''}`}
              onClick={() => setAreaShape(shape)}
            >
              <span className="tool-icon">{icon}</span>
              <span className="tool-label">{label}</span>
            </button>
          ))}
        </div>
      )}

      {toolMode === 'measure' &&
        (measureTool === 'distance' || measureTool === 'perimeter' || (measureTool === 'area' && areaShape === 'polygon')) && (
          <label className="source-color-toggle">
            <input type="checkbox" checked={orthoSnap} onChange={(e) => setOrthoSnap(e.target.checked)} />
            קווים ישרים בלבד (90°)
          </label>
        )}

      {toolMode === 'measure' && measureTool && (
        <p className="alignment-hint">
          {measureTool === 'distance'
            ? 'לחץ 2 נקודות כדי למדוד מרחק'
            : measureTool === 'area' && areaShape === 'rectangle'
              ? 'לחץ פינת התחלה וסיום למלבן'
              : `לחץ נקודות ולסגור ליד הנקודה הראשונה (${measurePoints.length} נקודות)`}
        </p>
      )}

      {pageMeasurements.length === 0 ? (
        <p className="muted">אין עדיין מדידות בעמוד זה.</p>
      ) : (
        <ul className="measurement-list">
          {pageMeasurements.map((m) => (
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
