import { useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import { buildReportCategoryTotals, buildRoomSummaries } from '../lib/quantities';
import { NOT_CALIBRATED_LABEL, PANEL_HEIGHT_M, REPORT_CATEGORY_LABELS } from '../types';
import Icon from './Icon';

const DASH = '—';

/**
 * The contractor-facing quantity report. Lives inside the bottom quantities panel, which is what
 * gives its 17 columns room to breathe; `showDefaults` is owned by that panel so its toggle can sit
 * in the panel header, away from the export actions.
 *
 * Nothing here computes anything: every number comes from lib/quantities, unchanged.
 */
export default function QuantityTable({ showDefaults = false }: { showDefaults?: boolean }) {
  const project = useAppStore((s) => s.project);
  const updateProjectMeta = useAppStore((s) => s.updateProjectMeta);

  const summaries = useMemo(() => (project ? buildRoomSummaries(project) : []), [project]);
  const totals = useMemo(() => (project ? buildReportCategoryTotals(project, summaries) : []), [project, summaries]);

  if (!project) return null;

  // Rooms on pages with no scale: the summary reports their numbers as null, and they are labelled
  // rather than shown as 0.
  const hasUncalibratedRooms = summaries.some((s) => !s.pageCalibrated);
  const hasAreaMeasurements = (project.measurements ?? []).some((m) => m.tool === 'area' && m.areaKind);

  return (
    <div className="quantity-table-wrap">
      {showDefaults && (
        <div className="defaults-panel">
          <p className="defaults-note">
            ברירות מחדל לחישוב — משפיעות על פריטי עבודה חדשים ועל פריטים ללא ערך משלהם.
          </p>
          <div className="form-row inline">
            <label>גובה חיפוי (מ')</label>
            <input
              type="number"
              step="0.05"
              min="0"
              value={project.defaultCladdingHeightM}
              onChange={(e) => updateProjectMeta({ defaultCladdingHeightM: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="form-row inline">
            <label>גובה פנלים (מ')</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={project.defaultPanelHeightM ?? PANEL_HEIGHT_M}
              onChange={(e) => updateProjectMeta({ defaultPanelHeightM: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="form-row inline">
            <label>פחת ריצוף רגיל (%)</label>
            <input
              type="number"
              step="1"
              min="0"
              max="100"
              value={project.defaultTilingWastePercent}
              onChange={(e) => updateProjectMeta({ defaultTilingWastePercent: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="form-row inline">
            <label>פחת ריצוף AS (%)</label>
            <input
              type="number"
              step="1"
              min="0"
              max="100"
              value={project.defaultTilingAsWastePercent ?? project.defaultTilingWastePercent}
              onChange={(e) => updateProjectMeta({ defaultTilingAsWastePercent: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="form-row inline">
            <label>פחת חיפוי (%)</label>
            <input
              type="number"
              step="1"
              min="0"
              max="100"
              value={project.defaultCladdingWastePercent}
              onChange={(e) => updateProjectMeta({ defaultCladdingWastePercent: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="form-row inline">
            <label>פחת פנלים (%)</label>
            <input
              type="number"
              step="1"
              min="0"
              max="100"
              value={project.defaultPanelsWastePercent}
              onChange={(e) => updateProjectMeta({ defaultPanelsWastePercent: parseFloat(e.target.value) || 0 })}
            />
          </div>
        </div>
      )}

      {summaries.length === 0 ? (
        <div className="empty-state">
          <Icon name="table" size={28} />
          <p>
            אין עדיין כמויות לחישוב. סמן חדרים על התוכנית בטאב "חדרים ודירות".
            {hasAreaMeasurements && ' יש לך סימוני הריסה/בנייה — ייצוא ה-PDF וה-Excel יכללו אותם.'}
          </p>
        </div>
      ) : (
        <>
          <div className="qty-table-scroll">
            <table className="qty-table">
              <thead>
                {/* Two header rows: the columns are grouped by what they are (net areas · waste ·
                    to order), so 17 headings read as four ideas instead of seventeen. */}
                <tr className="qty-group-row">
                  <th className="spacer sticky-col col-apt" />
                  <th className="spacer sticky-col col-room" />
                  <th colSpan={5} className="group-edge">
                    כמות נטו
                  </th>
                  <th colSpan={4} className="group-edge">
                    פחת
                  </th>
                  <th colSpan={5} className="group-edge">
                    להזמנה (כולל פחת)
                  </th>
                  <th className="group-edge" />
                </tr>
                <tr className="qty-col-row">
                  <th className="sticky-col col-apt">דירה</th>
                  <th className="sticky-col col-room">חדר</th>
                  <th className="num group-edge">שטח ריצוף רגיל</th>
                  <th className="num">שטח ריצוף AS</th>
                  <th className="num">שטח חיפוי</th>
                  <th className="num">אורך פנלים (מ"א)</th>
                  <th className="num">שטח פנלים</th>
                  <th className="num group-edge">ריצוף רגיל %</th>
                  <th className="num">ריצוף AS %</th>
                  <th className="num">חיפוי %</th>
                  <th className="num">פנלים %</th>
                  <th className="num group-edge">ריצוף רגיל</th>
                  <th className="num">ריצוף AS</th>
                  <th className="num">חיפוי</th>
                  <th className="num">אורך פנלים (מ"א)</th>
                  <th className="num">פנלים</th>
                  <th className="group-edge">הערות</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((s) => {
                  // Quantity cells of an unscaled page show why they are blank instead of showing 0.
                  const noScale = !s.pageCalibrated;
                  const qty = (v: number | null) =>
                    noScale ? <span className="cal-missing">{NOT_CALIBRATED_LABEL}</span> : (v ?? DASH);
                  const order = (v: number | null) =>
                    noScale ? <span className="cal-missing">{NOT_CALIBRATED_LABEL}</span> : v != null ? v : DASH;
                  return (
                    <tr key={s.roomId}>
                      <td className="sticky-col col-apt">{s.apartmentNumber || DASH}</td>
                      <td className="sticky-col col-room">{s.roomName}</td>
                      <td className="num group-edge">{qty(s.tilingRegularAreaM2)}</td>
                      <td className="num">{qty(s.tilingAsAreaM2)}</td>
                      <td className="num">{qty(s.claddingAreaM2)}</td>
                      <td className="num">{qty(s.panelsLengthM)}</td>
                      <td className="num">{qty(s.panelsAreaM2)}</td>
                      <td className="num group-edge">{s.tilingRegularWastePercent != null ? `${s.tilingRegularWastePercent}%` : DASH}</td>
                      <td className="num">{s.tilingAsWastePercent != null ? `${s.tilingAsWastePercent}%` : DASH}</td>
                      <td className="num">{s.claddingWastePercent != null ? `${s.claddingWastePercent}%` : DASH}</td>
                      <td className="num">{s.panelsWastePercent != null ? `${s.panelsWastePercent}%` : DASH}</td>
                      <td className="num order group-edge">{order(s.tilingRegularOrderM2)}</td>
                      <td className="num order">{order(s.tilingAsOrderM2)}</td>
                      <td className="num order">{order(s.claddingOrderM2)}</td>
                      <td className="num order">{order(s.panelsOrderLengthM)}</td>
                      <td className="num order">{order(s.panelsOrderM2)}</td>
                      <td className="group-edge">{s.notes || DASH}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {hasUncalibratedRooms && (
            <div className="warning-box">
              חדרים בעמודים שלא כוילו אינם מחושבים ואינם נכללים בסיכום שלהלן. כייל את אותם עמודים כדי לקבל את כמויותיהם.
            </div>
          )}

          <div className="qty-summary">
            <h4 className="qty-totals-title">סה"כ</h4>
            <table className="qty-summary-table">
              <thead>
                <tr>
                  <th>פריט</th>
                  <th>אורך (מ"א)</th>
                  <th>כמות נטו (מ"ר)</th>
                  <th>פחת</th>
                  <th>אורך להזמנה (מ"א)</th>
                  <th>להזמנה (מ"ר)</th>
                </tr>
              </thead>
              <tbody>
                {totals.map((t) => (
                  <tr key={t.category}>
                    <td>{REPORT_CATEGORY_LABELS[t.category]}</td>
                    <td>{t.lengthM ?? DASH}</td>
                    <td>{t.quantityM2}</td>
                    <td>{t.wastePercent}%</td>
                    <td className="order">{t.orderLengthM ?? DASH}</td>
                    <td className="order">{t.orderM2}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
