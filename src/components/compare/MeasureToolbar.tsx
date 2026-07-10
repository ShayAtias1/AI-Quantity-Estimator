import { useCompareStore } from '../../store/compareStore';
import { AREA_KIND_LABELS, MEASURE_TOOL_LABELS, type AreaKind, type MeasureTool } from '../../types/compare';

const MEASURE_TOOLS: MeasureTool[] = ['distance', 'area', 'perimeter'];
const MEASURE_ICONS: Record<MeasureTool, string> = { distance: '📏', area: '⬛', perimeter: '⭕' };
const AREA_KINDS: AreaKind[] = ['demolition', 'construction'];

export default function MeasureToolbar() {
  const comparison = useCompareStore((s) => s.comparison);
  const currentPageKey = useCompareStore((s) => s.currentPageKey);
  const toolMode = useCompareStore((s) => s.toolMode);
  const measureTool = useCompareStore((s) => s.measureTool);
  const setMeasureTool = useCompareStore((s) => s.setMeasureTool);
  const measurePoints = useCompareStore((s) => s.measurePoints);
  const pendingAreaKind = useCompareStore((s) => s.pendingAreaKind);
  const setPendingAreaKind = useCompareStore((s) => s.setPendingAreaKind);
  const startCalibration = useCompareStore((s) => s.startCalibration);
  const deleteMeasurement = useCompareStore((s) => s.deleteMeasurement);

  if (!comparison) return null;
  const page = comparison.pages[currentPageKey];
  const hasCalibration = !!(page?.originalCalibration || page?.revisions[comparison.activeRevisionId]?.revisedCalibration);
  const activeRevisionLabel = comparison.revisions.find((r) => r.id === comparison.activeRevisionId)?.label ?? 'מעודכן';

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
          📏 כיול לפי {activeRevisionLabel}
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

      {toolMode === 'measure' && measureTool === 'area' && (
        <div className="area-kind-row">
          {AREA_KINDS.map((k) => (
            <button
              key={k}
              className={`area-kind-btn ${pendingAreaKind === k ? 'active' : ''}`}
              onClick={() => setPendingAreaKind(pendingAreaKind === k ? null : k)}
            >
              <span className="color-dot" style={{ background: comparison.areaKindColors[k] }} />
              {AREA_KIND_LABELS[k]}
              <input
                type="color"
                value={comparison.areaKindColors[k]}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => useCompareStore.getState().setAreaKindColor(k, e.target.value)}
                title="שנה צבע"
              />
            </button>
          ))}
        </div>
      )}

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
                <span className="color-dot" style={{ background: m.areaKind ? comparison.areaKindColors[m.areaKind] : '#0ea5e9' }} />{' '}
                {m.areaKind ? AREA_KIND_LABELS[m.areaKind] : MEASURE_TOOL_LABELS[m.tool]}: <strong>{m.label}</strong>
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
