import { useMemo, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { buildReportCategoryTotals, buildRoomSummaries } from '../lib/quantities';
import { REPORT_CATEGORY_LABELS } from '../types';
import { exportQuantitiesToExcel } from '../lib/exportExcel';
import { exportQuantitiesToPdf } from '../lib/exportQuantitiesPdf';

const DASH = '—';

export default function QuantityTable() {
  const project = useAppStore((s) => s.project);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const summaries = useMemo(() => (project ? buildRoomSummaries(project) : []), [project]);
  const totals = useMemo(() => (project ? buildReportCategoryTotals(project, summaries) : []), [project, summaries]);

  if (!project) return null;

  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      await exportQuantitiesToExcel(project, summaries, totals);
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      await exportQuantitiesToPdf(project, summaries, totals);
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="quantity-table-wrap">
      <div className="quantity-table-toolbar">
        <h4>טבלת כמויות</h4>
        <div className="quantity-table-toolbar-actions">
          <button className="btn-secondary" onClick={handleExportPdf} disabled={summaries.length === 0 || exportingPdf}>
            {exportingPdf ? 'מייצא…' : '⬇ ייצוא ל-PDF'}
          </button>
          <button className="btn-primary" onClick={handleExportExcel} disabled={summaries.length === 0 || exportingExcel}>
            {exportingExcel ? 'מייצא…' : '⬇ ייצוא לאקסל'}
          </button>
        </div>
      </div>

      {summaries.length === 0 ? (
        <p className="muted">אין עדיין כמויות לחישוב. סמן חדרים על התוכנית.</p>
      ) : (
        <>
          <div className="qty-table-scroll">
            <table className="qty-table">
              <thead>
                <tr>
                  <th>דירה</th>
                  <th>חדר</th>
                  <th>שטח ריצוף רגיל</th>
                  <th>שטח ריצוף AS</th>
                  <th>שטח חיפוי</th>
                  <th>שטח פנלים</th>
                  <th>פחת ריצוף רגיל %</th>
                  <th>פחת ריצוף AS %</th>
                  <th>פחת חיפוי %</th>
                  <th>פחת פנלים %</th>
                  <th>ריצוף רגיל להזמנה</th>
                  <th>ריצוף AS להזמנה</th>
                  <th>חיפוי להזמנה</th>
                  <th>פנלים להזמנה</th>
                  <th>הערות</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((s) => (
                  <tr key={s.roomId}>
                    <td>{s.apartmentNumber || DASH}</td>
                    <td>{s.roomName}</td>
                    <td>{s.tilingRegularAreaM2 ?? DASH}</td>
                    <td>{s.tilingAsAreaM2 ?? DASH}</td>
                    <td>{s.claddingAreaM2 ?? DASH}</td>
                    <td>{s.panelsAreaM2 ?? DASH}</td>
                    <td>{s.tilingRegularWastePercent != null ? `${s.tilingRegularWastePercent}%` : DASH}</td>
                    <td>{s.tilingAsWastePercent != null ? `${s.tilingAsWastePercent}%` : DASH}</td>
                    <td>{s.claddingWastePercent != null ? `${s.claddingWastePercent}%` : DASH}</td>
                    <td>{s.panelsWastePercent != null ? `${s.panelsWastePercent}%` : DASH}</td>
                    <td>{s.tilingRegularOrderM2 != null ? <strong>{s.tilingRegularOrderM2}</strong> : DASH}</td>
                    <td>{s.tilingAsOrderM2 != null ? <strong>{s.tilingAsOrderM2}</strong> : DASH}</td>
                    <td>{s.claddingOrderM2 != null ? <strong>{s.claddingOrderM2}</strong> : DASH}</td>
                    <td>{s.panelsOrderM2 != null ? <strong>{s.panelsOrderM2}</strong> : DASH}</td>
                    <td>{s.notes || DASH}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="qty-summary">
            <h4 className="qty-totals-title">סה"כ</h4>
            <table className="qty-summary-table">
              <thead>
                <tr>
                  <th>פריט</th>
                  <th>כמות נטו (מ"ר)</th>
                  <th>פחת</th>
                  <th>להזמנה (מ"ר)</th>
                </tr>
              </thead>
              <tbody>
                {totals.map((t) => (
                  <tr key={t.category}>
                    <td>{REPORT_CATEGORY_LABELS[t.category]}</td>
                    <td>{t.quantityM2}</td>
                    <td>{t.wastePercent}%</td>
                    <td>
                      <strong>{t.orderM2}</strong>
                    </td>
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
