import { useAppStore } from '../store/appStore';
import { AREA_KIND_LABELS, MEASURE_TOOL_LABELS, type AreaCalcMode, type AreaKind, type AreaShape, type MeasureTool } from '../types';
import { round } from '../lib/geometry';

const MEASURE_TOOLS: MeasureTool[] = ['distance', 'area', 'perimeter'];
const MEASURE_ICONS: Record<MeasureTool, string> = { distance: '📏', area: '⬛', perimeter: '⭕' };
const AREA_SHAPES: { shape: AreaShape; label: string; icon: string }[] = [
  { shape: 'polygon', label: 'פוליגון', icon: '⬠' },
  { shape: 'rectangle', label: 'מלבן', icon: '▭' },
];
const AREA_CALC_MODES: { mode: AreaCalcMode; label: string; icon: string }[] = [
  { mode: 'footprint', label: 'שטח בפועל', icon: '⬛' },
  { mode: 'wall', label: 'קיר: אורך × גובה', icon: '📐' },
];
const AREA_KINDS: AreaKind[] = ['demolition', 'construction'];

export default function MeasureToolbar() {
  const project = useAppStore((s) => s.project);
  const currentPage = useAppStore((s) => s.currentPage);
  const toolMode = useAppStore((s) => s.toolMode);
  const measureTool = useAppStore((s) => s.measureTool);
  const setMeasureTool = useAppStore((s) => s.setMeasureTool);
  const setToolMode = useAppStore((s) => s.setToolMode);
  const measurePoints = useAppStore((s) => s.measurePoints);
  const areaShape = useAppStore((s) => s.areaShape);
  const setAreaShape = useAppStore((s) => s.setAreaShape);
  const areaCalcMode = useAppStore((s) => s.areaCalcMode);
  const setAreaCalcMode = useAppStore((s) => s.setAreaCalcMode);
  const pendingAreaKind = useAppStore((s) => s.pendingAreaKind);
  const setPendingAreaKind = useAppStore((s) => s.setPendingAreaKind);
  const setAreaKindColor = useAppStore((s) => s.setAreaKindColor);
  const orthoSnap = useAppStore((s) => s.orthoSnap);
  const setOrthoSnap = useAppStore((s) => s.setOrthoSnap);
  const deleteMeasurement = useAppStore((s) => s.deleteMeasurement);
  const updateMeasurement = useAppStore((s) => s.updateMeasurement);
  const updateProjectMeta = useAppStore((s) => s.updateProjectMeta);

  if (!project) return null;
  const hasCalibration = !!project.pages[currentPage]?.calibration;
  const pageMeasurements = (project.measurements ?? []).filter((m) => m.pageNumber === currentPage);
  const areaKindColors = project.areaKindColors ?? { demolition: '#eab308', construction: '#16a34a' };
  const wallHeightDefaultM = project.wallHeightDefaultM ?? 2.5;

  const areaMeasurements = (project.measurements ?? []).filter((m) => m.tool === 'area' && m.areaKind && typeof m.areaM2 === 'number');
  const tallyByKind = (measurements: typeof areaMeasurements) => {
    const totals: Record<AreaKind, number> = { demolition: 0, construction: 0 };
    const counts: Record<AreaKind, number> = { demolition: 0, construction: 0 };
    for (const m of measurements) {
      totals[m.areaKind!] += m.areaM2!;
      counts[m.areaKind!] += 1;
    }
    return { totals, counts };
  };
  const pageNumbersWithAreas = Array.from(new Set(areaMeasurements.map((m) => m.pageNumber))).sort((a, b) => a - b);
  const grandTally = tallyByKind(areaMeasurements);
  const currentPageTally = tallyByKind(areaMeasurements.filter((m) => m.pageNumber === currentPage));

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
        <button
          className={`tool-btn small-tool ${toolMode === 'calibrate' ? 'active' : ''}`}
          onClick={() => setToolMode(toolMode === 'calibrate' ? 'select' : 'calibrate')}
        >
          <span className="tool-icon">📏</span>
          <span className="tool-label">{hasCalibration ? 'כיול מחדש' : 'כיול קנה מידה'}</span>
        </button>
      </div>
      {toolMode === 'calibrate' && <p className="alignment-hint">לחץ שתי נקודות שהמרחק ביניהן ידוע, והזן אותו בחלון.</p>}

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
            {AREA_CALC_MODES.map(({ mode, label, icon }) => (
              <button
                key={mode}
                className={`tool-btn small-tool ${areaCalcMode === mode ? 'active' : ''}`}
                onClick={() => setAreaCalcMode(mode)}
              >
                <span className="tool-icon">{icon}</span>
                <span className="tool-label">{label}</span>
              </button>
            ))}
          </div>
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
          {areaCalcMode === 'wall' && (
            <div className="form-row">
              <label>גובה קיר ברירת מחדל (מ')</label>
              <input
                type="number"
                step="0.05"
                min="0.1"
                value={wallHeightDefaultM}
                onChange={(e) => updateProjectMeta({ wallHeightDefaultM: parseFloat(e.target.value) || 0 })}
              />
            </div>
          )}
          <div className="area-kind-row">
            {AREA_KINDS.map((k) => (
              <button
                key={k}
                className={`area-kind-btn ${pendingAreaKind === k ? 'active' : ''}`}
                onClick={() => setPendingAreaKind(pendingAreaKind === k ? null : k)}
              >
                <span className="color-dot" style={{ background: areaKindColors[k] }} />
                {AREA_KIND_LABELS[k]}
                <input
                  type="color"
                  value={areaKindColors[k]}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setAreaKindColor(k, e.target.value)}
                  title="שנה צבע"
                />
              </button>
            ))}
          </div>
        </>
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

      {areaMeasurements.length > 0 && (
        <div className="area-summary">
          <h4>סיכום שטחים</h4>
          {pageNumbersWithAreas.length > 1 && (
            <div className="area-summary-page">
              <div className="area-summary-page-title">עמוד {currentPage} (נוכחי)</div>
              {AREA_KINDS.map((k) => (
                <div key={k} className="area-summary-row">
                  <div className="area-summary-row-header">
                    <span className="color-dot" style={{ background: areaKindColors[k] }} />
                    <span className="area-summary-label">{AREA_KIND_LABELS[k]}</span>
                    <span className="area-summary-count">{currentPageTally.counts[k]} סימונים</span>
                  </div>
                  <span className="area-summary-total">{round(currentPageTally.totals[k], 2)} מ"ר</span>
                </div>
              ))}
            </div>
          )}
          {pageNumbersWithAreas.length > 1 && <div className="area-summary-page-title">סה"כ כל העמודים</div>}
          {AREA_KINDS.map((k) => (
            <div key={k} className="area-summary-row">
              <div className="area-summary-row-header">
                <span className="color-dot" style={{ background: areaKindColors[k] }} />
                <span className="area-summary-label">{AREA_KIND_LABELS[k]}</span>
                <span className="area-summary-count">{grandTally.counts[k]} סימונים</span>
              </div>
              <span className="area-summary-total">{round(grandTally.totals[k], 2)} מ"ר</span>
            </div>
          ))}
        </div>
      )}

      {pageMeasurements.length === 0 ? (
        <p className="muted">אין עדיין מדידות בעמוד זה.</p>
      ) : (
        <ul className="measurement-list">
          {pageMeasurements.map((m) => {
            const isWall = m.tool === 'area' && m.calcMode === 'wall';
            return (
              <li key={m.id}>
                <span>
                  {m.areaKind ? (
                    <span className="color-dot" style={{ background: areaKindColors[m.areaKind] }} />
                  ) : null}{' '}
                  {m.areaKind ? AREA_KIND_LABELS[m.areaKind] : MEASURE_TOOL_LABELS[m.tool]}: <strong>{m.label}</strong>
                  {isWall && (
                    <>
                      {' '}(אורך {round(m.wallLengthM ?? 0, 2)} מ' × גובה{' '}
                      <input
                        type="number"
                        step="0.05"
                        min="0.1"
                        style={{ width: 56 }}
                        value={m.wallHeightM ?? wallHeightDefaultM}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const h = parseFloat(e.target.value) || 0;
                          const area = round((m.wallLengthM ?? 0) * h, 2);
                          updateMeasurement(m.id, { wallHeightM: h, areaM2: area, label: `${area} מ"ר` });
                        }}
                      />
                      {' '}מ')
                    </>
                  )}
                </span>
                <button className="icon-btn danger" onClick={() => deleteMeasurement(m.id)}>
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
