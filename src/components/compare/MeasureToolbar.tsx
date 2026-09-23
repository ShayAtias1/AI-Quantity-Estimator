import { useEffect } from 'react';
import { compareScaleFor, useCompareStore } from '../../store/compareStore';
import { AREA_KIND_LABELS, MEASURE_TOOL_LABELS, type AreaCalcMode, type AreaKind, type AreaShape, type MeasureTool } from '../../types/compare';
import { round } from '../../lib/geometry';
import { changeMeasurements, isChangeMeasurement } from '../../lib/changeMeasurements';
import Icon, { type IconName } from '../Icon';

const MEASURE_TOOLS: MeasureTool[] = ['distance', 'area', 'perimeter'];
const MEASURE_ICONS: Record<MeasureTool, IconName> = { distance: 'ruler', area: 'square', perimeter: 'circle' };
const AREA_KINDS: AreaKind[] = ['demolition', 'construction'];
const AREA_SHAPES: { shape: AreaShape; label: string; icon: IconName }[] = [
  { shape: 'polygon', label: 'פוליגון', icon: 'polygon' },
  { shape: 'rectangle', label: 'מלבן', icon: 'rectangle' },
];
const AREA_CALC_MODES: { mode: AreaCalcMode; label: string; icon: IconName }[] = [
  { mode: 'footprint', label: 'שטח בפועל', icon: 'square' },
  { mode: 'wall', label: 'אורך × גובה', icon: 'dimension' },
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
  const areaCalcMode = useCompareStore((s) => s.areaCalcMode);
  const setAreaCalcMode = useCompareStore((s) => s.setAreaCalcMode);
  const orthoSnap = useCompareStore((s) => s.orthoSnap);
  const setOrthoSnap = useCompareStore((s) => s.setOrthoSnap);
  const deleteMeasurement = useCompareStore((s) => s.deleteMeasurement);
  const updateMeasurement = useCompareStore((s) => s.updateMeasurement);
  const updateComparisonMeta = useCompareStore((s) => s.updateComparisonMeta);
  const startChangeMeasurement = useCompareStore((s) => s.startChangeMeasurement);
  const setChangesOpen = useCompareStore((s) => s.setChangesOpen);

  // Losing the scale — switching to an uncalibrated page, or re-aligning a layer whose legacy
  // calibration can no longer be interpreted — puts the measure tool away instead of leaving it
  // armed over a page where it can only discard what the user draws.
  const measurableScale = comparison ? compareScaleFor(comparison, currentPageKey).state === 'calibrated' : false;
  useEffect(() => {
    if (!measurableScale && measureTool) setMeasureTool(null);
  }, [measurableScale, measureTool, setMeasureTool]);

  if (!comparison) return null;
  // One scale rule for the whole feature: a measurement is only allowed when it can be converted
  // to real-world units correctly — see resolveCompareScale.
  const scale = compareScaleFor(comparison, currentPageKey);
  const canMeasure = scale.state === 'calibrated';
  const blockedReason =
    scale.state === 'ambiguous'
      ? 'הכיול השמור של הגרסה נמדד לפני שינוי קנה המידה של היישור ואינו ניתן לפענוח — כייל מחדש כדי למדוד.'
      : 'העמוד אינו מכויל — כייל אותו למעלה לפני מדידה.';
  const activeRevision = comparison.revisions.find((r) => r.id === comparison.activeRevisionId);
  // Measurements belong to a source page: page 2 must not list page 1's work. Demolition and new
  // construction are reviewed in the שינויים panel, so this list keeps to plain measurements
  // instead of being a second, competing list of the same change items.
  const pageMeasurements = (activeRevision?.measurements ?? []).filter((m) => m.pageNumber === currentPageKey);
  const measurements = pageMeasurements.filter((m) => !isChangeMeasurement(m));
  const pageChangeCount = changeMeasurements(pageMeasurements).length;
  const armedKind = toolMode === 'measure' && measureTool === 'area' ? pendingAreaKind : null;
  const showAreaOptions = toolMode === 'measure' && measureTool === 'area';
  const wallHeightDefaultM = comparison.wallHeightDefaultM;

  return (
    <div className="measure-toolbar">
      {/* Calibration itself is reported once, in the context strip above the tabs; what belongs
          here is only whether measuring is allowed at all right now. */}
      {!canMeasure && (
        <div className="warning-box">
          <Icon name="alert" size={13} />
          {blockedReason}
        </div>
      )}

      {/* The workspace's main job: recording what is demolished and what is built. One deliberate
          click each — not a classification hidden three levels inside a generic area tool. Both
          arm the same area/wall drawing infrastructure, already classified. */}
      <div className="tool-group">
        <span className="section-label">תיעוד שינויים</span>
        <div className="segmented change-kinds">
          {AREA_KINDS.map((k) => (
            <button
              key={k}
              className={`tool-btn change-kind ${k} ${armedKind === k ? 'active' : ''}`}
              onClick={() => (armedKind === k ? setPendingAreaKind(null) : startChangeMeasurement(k))}
              disabled={!canMeasure}
              aria-pressed={armedKind === k}
              title={canMeasure ? `סמן ${AREA_KIND_LABELS[k]} על התוכנית` : blockedReason}
            >
              <span className="color-dot" style={{ background: comparison.areaKindColors[k] }} />
              <span className="tool-label">{AREA_KIND_LABELS[k]}</span>
            </button>
          ))}
        </div>

        {armedKind && (
          <p className={`tool-hint armed ${armedKind}`}>
            <Icon name="scan" size={13} />
            מסמן {AREA_KIND_LABELS[armedKind]} · {areaCalcMode === 'wall' ? 'אורך × גובה' : 'שטח בפועל'}
          </p>
        )}

        <button className="btn-ghost small full-width" onClick={() => setChangesOpen(true)}>
          <Icon name="table" />
          חלונית השינויים{pageChangeCount > 0 ? ` · ${pageChangeCount} בעמוד זה` : ''}
        </button>
      </div>

      {/* Secondary: plain, unclassified measurements. */}
      <div className="tool-group">
        <span className="section-label">כלי מדידה</span>
        <div className="segmented grid">
          {MEASURE_TOOLS.map((t) => (
            <button
              key={t}
              className={`tool-btn ${toolMode === 'measure' && !armedKind && measureTool === t ? 'active' : ''}`}
              onClick={() => setMeasureTool(measureTool === t && !armedKind ? null : t)}
              disabled={!canMeasure}
              aria-pressed={toolMode === 'measure' && !armedKind && measureTool === t}
              title={canMeasure ? MEASURE_TOOL_LABELS[t] : blockedReason}
            >
              <Icon name={MEASURE_ICONS[t]} />
              <span className="tool-label">{MEASURE_TOOL_LABELS[t]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* How an area is measured — shared by a classified change and a plain area measurement. */}
      {showAreaOptions && (
        <>
          <div className="tool-group">
            <span className="section-label">אופן חישוב</span>
            <div className="segmented">
              {AREA_CALC_MODES.map(({ mode, label, icon }) => (
                <button
                  key={mode}
                  className={`tool-btn ${areaCalcMode === mode ? 'active' : ''}`}
                  onClick={() => setAreaCalcMode(mode)}
                  aria-pressed={areaCalcMode === mode}
                >
                  <Icon name={icon} />
                  <span className="tool-label">{label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="tool-group">
            <span className="section-label">צורה</span>
            <div className="segmented">
              {AREA_SHAPES.map(({ shape, label, icon }) => (
                <button
                  key={shape}
                  className={`tool-btn ${areaShape === shape ? 'active' : ''}`}
                  onClick={() => setAreaShape(shape)}
                  aria-pressed={areaShape === shape}
                >
                  <Icon name={icon} />
                  <span className="tool-label">{label}</span>
                </button>
              ))}
            </div>
          </div>
          {areaCalcMode === 'wall' && (
            <div className="form-row">
              <label>גובה קיר ברירת מחדל (מ')</label>
              <input
                type="number"
                step="0.05"
                min="0.1"
                value={wallHeightDefaultM}
                onChange={(e) => updateComparisonMeta({ wallHeightDefaultM: parseFloat(e.target.value) || 0 })}
              />
            </div>
          )}
        </>
      )}

      {toolMode === 'measure' && (measureTool === 'perimeter' || (measureTool === 'area' && areaShape === 'polygon')) && (
        <label className="source-color-toggle">
          <input type="checkbox" checked={orthoSnap} onChange={(e) => setOrthoSnap(e.target.checked)} />
          קווים ישרים בלבד (90°)
        </label>
      )}

      {toolMode === 'measure' && measureTool && (
        <p className="tool-hint">
          <Icon name="alert" size={13} />
          {measureTool === 'distance'
            ? 'לחץ 2 נקודות כדי למדוד מרחק'
            : measureTool === 'area' && areaShape === 'rectangle'
              ? 'לחץ פינת התחלה וסיום למלבן'
              : `לחץ נקודות ולסגור ליד הנקודה הראשונה (${measurePoints.length} נקודות)`}
        </p>
      )}

      {measurements.length === 0 ? (
        <div className="empty-state">
          <Icon name="ruler" size={24} />
          <p>אין מדידות רגילות בעמוד זה. סימוני הריסה ובנייה נאספים בחלונית השינויים.</p>
        </div>
      ) : (
        <ul className="measurement-list">
          {measurements.map((m) => {
            const isWall = m.tool === 'area' && m.calcMode === 'wall';
            return (
              <li key={m.id}>
                <span>
                  {MEASURE_TOOL_LABELS[m.tool]}: <strong>{m.label}</strong>
                  {isWall && (
                    <>
                      {' '}(אורך {round(m.wallLengthM ?? 0, 2)} מ' × גובה{' '}
                      <input
                        type="number"
                        step="0.05"
                        min="0.1"
                        className="inline-number"
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
                <span className="list-item-actions">
                  <button className="icon-btn danger" title="מחק מדידה" onClick={() => deleteMeasurement(m.id)}>
                    <Icon name="trash" />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
