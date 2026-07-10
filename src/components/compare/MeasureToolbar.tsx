import { useCompareStore } from '../../store/compareStore';
import { AREA_KIND_LABELS, MEASURE_TOOL_LABELS, type AreaKind, type AreaShape, type MeasureTool } from '../../types/compare';

const MEASURE_TOOLS: MeasureTool[] = ['distance', 'area', 'perimeter'];
const MEASURE_ICONS: Record<MeasureTool, string> = { distance: '📏', area: '⬛', perimeter: '⭕' };
const AREA_KINDS: AreaKind[] = ['demolition', 'construction'];
const AREA_SHAPES: { shape: AreaShape; label: string; icon: string }[] = [
  { shape: 'polygon', label: 'פוליגון', icon: '⬠' },
  { shape: 'rectangle', label: 'מלבן', icon: '▭' },
];

export default function MeasureToolbar() {
  const comparison = useCompareStore((s) => s.comparison);
  const currentPageKey = useCompareStore((s) => s.currentPageKey);
  const toolMode = useCompareStore((s) => s.toolMode);
  const measureTool = useCompareStore((s) => s.measureTool);
  const setMeasureTool = useCompareStore((s) => s.setMeasureTool);
  const measurePoints = useCompareStore((s) => s.measurePoints);
  const pendingAreaKind = useCompareStore((s) => s.pendingAreaKind);
  const setPendingAreaKind = useCompareStore((s) => s.setPendingAreaKind);
  const areaShape = useCompareStore((s) => s.areaShape);
  const setAreaShape = useCompareStore((s) => s.setAreaShape);
  const orthoSnap = useCompareStore((s) => s.orthoSnap);
  const setOrthoSnap = useCompareStore((s) => s.setOrthoSnap);
  const startCalibration = useCompareStore((s) => s.startCalibration);
  const deleteMeasurement = useCompareStore((s) => s.deleteMeasurement);

  if (!comparison) return null;
  const page = comparison.pages[currentPageKey];
  const hasCalibration = !!(page?.originalCalibration || page?.revisions[comparison.activeRevisionId]?.revisedCalibration);
  const activeRevision = comparison.revisions.find((r) => r.id === comparison.activeRevisionId);
  const activeRevisionLabel = activeRevision?.label ?? 'מעודכן';
  const measurements = activeRevision?.measurements ?? [];

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
        <>
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
        </>
      )}

      {toolMode === 'measure' && (measureTool === 'perimeter' || (measureTool === 'area' && areaShape === 'polygon')) && (
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

      {measurements.length > 0 && (
        <ul className="measurement-list">
          {measurements.map((m) => (
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
