import { useMemo } from 'react';
import { t as tr } from '../i18n';
import { useAppStore } from '../store/appStore';
import {
  buildReportCategoryTotals,
  buildRoomSummaries,
  openingAreaM2,
  openingCountsText,
  usedReportCategories,
} from '../lib/quantities';
import { categoryPrimaryUnit, roomCategoryQuantity } from '../lib/projectQuantities';
import { round } from '../lib/geometry';
import { projectWasteDefault, WORK_TYPE_DEFINITIONS } from '../lib/workTypes';
import {
  EXTRA_REPORT_CATEGORIES,
  PANEL_HEIGHT_M,
} from '../types';
import Icon from './Icon';

const DASH = '—';

/**
 * The contractor-facing quantity report. Lives inside the bottom quantities panel; `showDefaults` is
 * owned by that panel so its toggle can sit in the panel header, away from the export actions.
 *
 * One column group per work type the plan uses (net · to order), identity columns sticky, and the
 * secondary numbers (waste %, skirting m², opening deductions) stacked under the number they explain
 * rather than given columns of their own.
 *
 * Nothing here computes anything: every number comes from lib/quantities, unchanged.
 */
export default function QuantityTable({ showDefaults = false }: { showDefaults?: boolean }) {
  const project = useAppStore((s) => s.project);
  const updateProjectMeta = useAppStore((s) => s.updateProjectMeta);

  const summaries = useMemo(() => (project ? buildRoomSummaries(project) : []), [project]);
  const totals = useMemo(() => (project ? buildReportCategoryTotals(project, summaries) : []), [project, summaries]);
  // A column group per work type some room actually uses — none is shown just because it exists.
  const categories = useMemo(() => usedReportCategories(summaries), [summaries]);
  const roomsById = useMemo(() => new Map((project?.rooms ?? []).map((r) => [r.id, r])), [project]);

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
          <div className="form-row inline">
            <label>גובה קיר לצבע/טיח (מ')</label>
            <input
              type="number"
              step="0.05"
              min="0"
              value={project.wallHeightDefaultM}
              onChange={(e) => updateProjectMeta({ wallHeightDefaultM: parseFloat(e.target.value) || 0 })}
            />
          </div>
          {EXTRA_REPORT_CATEGORIES.map((c) => {
            const def = WORK_TYPE_DEFINITIONS[c];
            return (
              <div className="form-row inline" key={c}>
                <label>פחת {tr(`workTypes.${def.id}`)} (%)</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={projectWasteDefault(def, project)}
                  onChange={(e) => updateProjectMeta({ [def.wasteDefaultField]: parseFloat(e.target.value) || 0 })}
                />
              </div>
            );
          })}
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
          {categories.length === 0 && (
            <p className="qty-table-hint muted">לחדרים אין עדיין סוגי עבודה — הוסף סוג עבודה לחדר כדי לראות את כמויותיו.</p>
          )}
          <div className="qty-table-scroll">
            <table className="qty-table qty-grid">
              <thead>
                {/* Grouped by work type: each type the plan uses gets its net and to-order columns
                    side by side, so one work type reads left to right in one place. Waste, the
                    m² reading of skirting and opening deductions sit under the number they explain. */}
                <tr className="qty-group-row">
                  <th className="spacer sticky-col col-apt" />
                  <th className="spacer sticky-col col-room" />
                  {categories.map((c) => (
                    <th key={c} colSpan={2} className="group-edge">
                      {tr(`reportCategories.${c}`)} <span className="qty-group-unit">({categoryPrimaryUnit(c)})</span>
                    </th>
                  ))}
                  <th colSpan={2} className="group-edge">
                    פרטים
                  </th>
                </tr>
                <tr className="qty-col-row">
                  <th className="sticky-col col-apt">דירה</th>
                  <th className="sticky-col col-room">חדר</th>
                  {categories.map((c) => [
                    <th key={`${c}-net`} className="num group-edge">
                      נטו
                    </th>,
                    <th key={`${c}-order`} className="num">
                      להזמנה
                    </th>,
                  ])}
                  <th className="group-edge">פתחים</th>
                  <th>הערות</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((s) => {
                  const room = roomsById.get(s.roomId);
                  const openings = room?.openings ?? [];
                  const openingsText = openingCountsText(openings);
                  const openingsArea = round(openings.reduce((sum, o) => sum + openingAreaM2(o), 0), 2);
                  return (
                    <tr key={s.roomId}>
                      <td className="sticky-col col-apt">{s.apartmentNumber || DASH}</td>
                      <td className="sticky-col col-room">{s.roomName}</td>
                      {categories.map((c) => {
                        const q = roomCategoryQuantity(s, c);
                        // The room has no item of this type: a quiet dash, not a number.
                        if (q.wastePercent == null) {
                          return [
                            <td key={`${c}-net`} className="num group-edge qty-none">{DASH}</td>,
                            <td key={`${c}-order`} className="num qty-none">{DASH}</td>,
                          ];
                        }
                        // An unscaled page: say why the cell is blank instead of showing 0.
                        if (!s.pageCalibrated) {
                          return [
                            <td key={`${c}-net`} className="num group-edge">
                              <span className="cal-missing">{tr('quantities.notCalibrated')}</span>
                            </td>,
                            <td key={`${c}-order`} className="num">
                              <span className="qty-sub">פחת {q.wastePercent}%</span>
                            </td>,
                          ];
                        }
                        const panels = c === 'panels';
                        const netSub: string[] = [];
                        const orderSub: string[] = [`פחת ${q.wastePercent}%`];
                        // The deduction reads as one short word under the net; hovering spells out
                        // gross − deduction = net.
                        let netTitle: string | undefined;
                        if (panels) {
                          netSub.push(`${q.quantityM2 ?? 0} ${tr('units.m2')}`);
                          orderSub.push(`${q.orderM2 ?? 0} ${tr('units.m2')}`);
                          const doors = s.panelsDeductedLengthM ?? 0;
                          if (doors > 0 && q.lengthM != null) {
                            netSub.push(`ניכוי ${doors}`);
                            netTitle = `ברוטו ${round(q.lengthM + doors, 2)} − ניכוי רוחב דלתות ${doors} = נטו ${q.lengthM} ${tr('units.lm')}`;
                          }
                        } else {
                          const deduction = s.openingDeductions.find((d) => d.category === c);
                          if (deduction) {
                            netSub.push(`ניכוי ${deduction.deductedM2}`);
                            netTitle = `ברוטו ${deduction.grossM2} − ניכוי פתחים ${deduction.deductedM2} = נטו ${deduction.netM2} ${tr('units.m2')}`;
                          }
                        }
                        return [
                          <td key={`${c}-net`} className="num group-edge" title={netTitle}>
                            <span className="qty-main">{panels ? q.lengthM : q.quantityM2}</span>
                            {netSub.length > 0 && <span className="qty-sub">{netSub.join(' · ')}</span>}
                          </td>,
                          <td key={`${c}-order`} className="num order">
                            <span className="qty-main">{panels ? q.orderLengthM : q.orderM2}</span>
                            <span className="qty-sub">{orderSub.join(' · ')}</span>
                          </td>,
                        ];
                      })}
                      <td
                        className={`group-edge qty-openings ${openingsText ? '' : 'qty-none'}`}
                        title={openings.map((o) => `${tr(`openingTypes.${o.type}`)} ${o.widthM}×${o.heightM} מ' ×${o.quantity}`).join('\n') || undefined}
                      >
                        {openingsText ? (
                          <>
                            <span className="qty-main">{openingsText}</span>
                            <span className="qty-sub">
                              {openingsArea} {tr('units.m2')}
                            </span>
                          </>
                        ) : (
                          DASH
                        )}
                      </td>
                      <td className={`qty-notes ${s.notes ? '' : 'qty-none'}`} title={s.notes || undefined}>
                        {s.notes || DASH}
                      </td>
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
                    <td>{tr(`reportCategories.${t.category}`)}</td>
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
