import { useAppStore } from '../store/appStore';
import type { AreaCalcMode, AreaKind, AreaShape, MeasureTool } from '../types';
import { MEASUREMENT_DEFAULTS } from '../config/measurementDefaults';
import { round } from '../lib/geometry';
import { measurementLabel } from '../lib/measurementValues';
import { isPageCalibrated } from '../lib/quantities';
import Icon, { type IconName } from './Icon';
import { useT } from '../i18n';

const MEASURE_TOOLS: MeasureTool[] = ['distance', 'area', 'perimeter'];
const MEASURE_ICONS: Record<MeasureTool, IconName> = { distance: 'ruler', area: 'square', perimeter: 'circle' };
// Labels: `measure.shapes.<shape>` and `measure.calcModes.<mode>`.
const AREA_SHAPES: { shape: AreaShape; icon: IconName }[] = [
  { shape: 'polygon', icon: 'polygon' },
  { shape: 'rectangle', icon: 'rectangle' },
];
const AREA_CALC_MODES: { mode: AreaCalcMode; icon: IconName }[] = [
  { mode: 'footprint', icon: 'square' },
  { mode: 'wall', icon: 'dimension' },
];
const AREA_KINDS: AreaKind[] = ['demolition', 'construction'];

export default function MeasureToolbar() {
  const t = useT();
  const project = useAppStore((s) => s.project);
  const currentPage = useAppStore((s) => s.currentPage);
  const toolMode = useAppStore((s) => s.toolMode);
  const measureTool = useAppStore((s) => s.measureTool);
  const setMeasureTool = useAppStore((s) => s.setMeasureTool);
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
  const hasCalibration = isPageCalibrated(project, currentPage);
  const pageMeasurements = (project.measurements ?? []).filter((m) => m.pageNumber === currentPage);
  const areaKindColors = project.areaKindColors ?? { demolition: '#eab308', construction: '#16a34a' };
  const wallHeightDefaultM = project.wallHeightDefaultM ?? MEASUREMENT_DEFAULTS.wallHeightM;

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
      <h4>{t('measure.title')}</h4>
      {/* Calibration now lives in the toolbar and in the page-status strip above the tabs. */}
      {!hasCalibration && <div className="warning-box">{t('measure.notCalibrated')}</div>}

      {/* Each row of identical buttons is now one labelled segmented control, so it is obvious
          what decision the row represents rather than three anonymous icons. */}
      <div className="tool-group">
        <span className="section-label">{t('measure.tools')}</span>
        <div className="segmented grid">
          {MEASURE_TOOLS.map((tool) => (
            <button
              key={tool}
              className={`tool-btn ${toolMode === 'measure' && measureTool === tool ? 'active' : ''}`}
              onClick={() => setMeasureTool(measureTool === tool ? null : tool)}
              aria-pressed={toolMode === 'measure' && measureTool === tool}
            >
              <Icon name={MEASURE_ICONS[tool]} />
              <span className="tool-label">{t(`measureTools.${tool}`)}</span>
            </button>
          ))}
        </div>
      </div>

      {toolMode === 'measure' && measureTool === 'area' && (
        <>
          <div className="tool-group">
            <span className="section-label">{t('measure.calcMode')}</span>
            <div className="segmented">
              {AREA_CALC_MODES.map(({ mode, icon }) => (
                <button
                  key={mode}
                  className={`tool-btn ${areaCalcMode === mode ? 'active' : ''}`}
                  onClick={() => setAreaCalcMode(mode)}
                  aria-pressed={areaCalcMode === mode}
                >
                  <Icon name={icon} />
                  <span className="tool-label">{t(`measure.calcModes.${mode}`)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="tool-group">
            <span className="section-label">{t('measure.shape')}</span>
            <div className="segmented">
              {AREA_SHAPES.map(({ shape, icon }) => (
                <button
                  key={shape}
                  className={`tool-btn ${areaShape === shape ? 'active' : ''}`}
                  onClick={() => setAreaShape(shape)}
                  aria-pressed={areaShape === shape}
                >
                  <Icon name={icon} />
                  <span className="tool-label">{t(`measure.shapes.${shape}`)}</span>
                </button>
              ))}
            </div>
          </div>
          {areaCalcMode === 'wall' && (
            <div className="form-row">
              <label>{t('measure.wallHeightDefault')}</label>
              <input
                type="number"
                step="0.05"
                min="0.1"
                value={wallHeightDefaultM}
                onChange={(e) => updateProjectMeta({ wallHeightDefaultM: parseFloat(e.target.value) || 0 })}
              />
            </div>
          )}
          <span className="section-label">{t('measure.areaKind')}</span>
          <div className="area-kind-row">
            {AREA_KINDS.map((k) => (
              <button
                key={k}
                className={`area-kind-btn ${pendingAreaKind === k ? 'active' : ''}`}
                onClick={() => setPendingAreaKind(pendingAreaKind === k ? null : k)}
              >
                <span className="color-dot" style={{ background: areaKindColors[k] }} />
                {t(`areaKinds.${k}`)}
                <input
                  type="color"
                  value={areaKindColors[k]}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setAreaKindColor(k, e.target.value)}
                  title={t('measure.changeColor')}
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
            {t('measure.orthoOnly')}
          </label>
        )}

      {toolMode === 'measure' && measureTool && (
        <p className="tool-hint">
          <Icon name="alert" size={13} />
          {measureTool === 'distance'
            ? t('measure.hintDistance')
            : measureTool === 'area' && areaShape === 'rectangle'
              ? t('measure.hintRectangle')
              : t('measure.hintPolygon', { count: measurePoints.length })}
        </p>
      )}

      {areaMeasurements.length > 0 && (
        <div className="area-summary">
          <h4>{t('measure.areaSummary')}</h4>
          {pageNumbersWithAreas.length > 1 && (
            <div className="area-summary-page">
              <div className="area-summary-page-title">{t('measure.currentPage', { page: currentPage })}</div>
              {AREA_KINDS.map((k) => (
                <div key={k} className="area-summary-row">
                  <div className="area-summary-row-header">
                    <span className="color-dot" style={{ background: areaKindColors[k] }} />
                    <span className="area-summary-label">{t(`areaKinds.${k}`)}</span>
                    <span className="area-summary-count">{t('measure.marks', { count: currentPageTally.counts[k] })}</span>
                  </div>
                  <span className="area-summary-total">
                    {round(currentPageTally.totals[k], 2)} {t('units.m2')}
                  </span>
                </div>
              ))}
            </div>
          )}
          {pageNumbersWithAreas.length > 1 && <div className="area-summary-page-title">{t('measure.allPages')}</div>}
          {AREA_KINDS.map((k) => (
            <div key={k} className="area-summary-row">
              <div className="area-summary-row-header">
                <span className="color-dot" style={{ background: areaKindColors[k] }} />
                <span className="area-summary-label">{t(`areaKinds.${k}`)}</span>
                <span className="area-summary-count">{t('measure.marks', { count: grandTally.counts[k] })}</span>
              </div>
              <span className="area-summary-total">
                {round(grandTally.totals[k], 2)} {t('units.m2')}
              </span>
            </div>
          ))}
        </div>
      )}

      {pageMeasurements.length === 0 ? (
        <div className="empty-state">
          <Icon name="ruler" size={24} />
          <p>{t('measure.empty')}</p>
        </div>
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
                  {m.areaKind ? t(`areaKinds.${m.areaKind}`) : t(`measureTools.${m.tool}`)}: <strong>{measurementLabel(m)}</strong>
                  {isWall && (
                    <>
                      {' '}
                      {t('measure.wallLength', { length: round(m.wallLengthM ?? 0, 2) })}{' '}
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
                          updateMeasurement(m.id, { wallHeightM: h, areaM2: area });
                        }}
                      />
                      {' '}
                      {t('units.m')})
                    </>
                  )}
                </span>
                <span className="list-item-actions">
                  <button className="icon-btn danger" title={t('measure.delete')} onClick={() => deleteMeasurement(m.id)}>
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
