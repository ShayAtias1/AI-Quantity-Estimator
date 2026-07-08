import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { Project, ReportCategoryTotal, RoomQuantitySummary } from '../types';
import { REPORT_CATEGORY_LABELS } from '../types';

const DASH = '—';

export async function exportQuantitiesToExcel(project: Project, summaries: RoomQuantitySummary[], totals: ReportCategoryTotal[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BetterCalc';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('כתב כמויות', { views: [{ rightToLeft: true }] });

  sheet.columns = [
    { header: 'דירה', key: 'apartment', width: 10 },
    { header: 'חדר', key: 'room', width: 18 },
    { header: 'שטח ריצוף רגיל (מ"ר)', key: 'tilingRegular', width: 18 },
    { header: 'שטח ריצוף AS (מ"ר)', key: 'tilingAs', width: 16 },
    { header: 'שטח חיפוי קירות (מ"ר)', key: 'cladding', width: 18 },
    { header: 'שטח פנלים (מ"ר)', key: 'panels', width: 15 },
    { header: 'פחת ריצוף רגיל (%)', key: 'tilingRegularWaste', width: 14 },
    { header: 'פחת ריצוף AS (%)', key: 'tilingAsWaste', width: 14 },
    { header: 'פחת חיפוי (%)', key: 'claddingWaste', width: 12 },
    { header: 'פחת פנלים (%)', key: 'panelsWaste', width: 12 },
    { header: 'ריצוף רגיל להזמנה', key: 'tilingRegularOrder', width: 15 },
    { header: 'ריצוף AS להזמנה', key: 'tilingAsOrder', width: 15 },
    { header: 'חיפוי להזמנה', key: 'claddingOrder', width: 14 },
    { header: 'פנלים להזמנה', key: 'panelsOrder', width: 14 },
    { header: 'הערות', key: 'notes', width: 24 },
  ];

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

  let lastDataRowNumber = 1;
  for (const s of summaries) {
    const row = sheet.addRow({
      apartment: s.apartmentNumber,
      room: s.roomName,
      tilingRegular: s.tilingRegularAreaM2 ?? DASH,
      tilingAs: s.tilingAsAreaM2 ?? DASH,
      cladding: s.claddingAreaM2 ?? DASH,
      panels: s.panelsAreaM2 ?? DASH,
      tilingRegularWaste: s.tilingRegularWastePercent ?? DASH,
      tilingAsWaste: s.tilingAsWastePercent ?? DASH,
      claddingWaste: s.claddingWastePercent ?? DASH,
      panelsWaste: s.panelsWastePercent ?? DASH,
      tilingRegularOrder: s.tilingRegularOrderM2 ?? DASH,
      tilingAsOrder: s.tilingAsOrderM2 ?? DASH,
      claddingOrder: s.claddingOrderM2 ?? DASH,
      panelsOrder: s.panelsOrderM2 ?? DASH,
      notes: s.notes,
    });
    lastDataRowNumber = row.number;
  }

  sheet.autoFilter = { from: 'A1', to: `O${lastDataRowNumber}` };

  // Totals summary section.
  sheet.addRow([]);
  const totalsHeaderRow = sheet.addRow(['סה"כ']);
  totalsHeaderRow.font = { bold: true, size: 13 };

  const totalsTableHeaderRow = sheet.addRow(['פריט', 'כמות נטו (מ"ר)', 'פחת (%)', 'להזמנה (מ"ר)']);
  totalsTableHeaderRow.font = { bold: true };
  totalsTableHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

  for (const t of totals) {
    const totalRow = sheet.addRow([REPORT_CATEGORY_LABELS[t.category], t.quantityM2, t.wastePercent, t.orderM2]);
    totalRow.font = { bold: true };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const safeName = project.name.replace(/[\\/:*?"<>|]/g, '_');
  saveAs(blob, `כתב-כמויות-${safeName}.xlsx`);
}
