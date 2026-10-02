import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { Plan, Project, ReportCategory } from '../types';
import { NOT_CALIBRATED_LABEL, REPORT_CATEGORY_LABELS } from '../types';
import { calculateWorkItem, effectiveWastePercent, roomMetrics } from './quantities';
import { buildProjectQuantities, PLAN_STATUS_LABELS, roomCategoryQuantity, type ProjectQuantities } from './projectQuantities';
import { workTypeDefinition } from './workTypes';
import { round } from './geometry';
import { sheetRef } from './excelSheetRef';

// Same palette as the single-plan workbook (exportExcel.ts).
const C_HEADER = 'FF1F4E79';
const C_ZEBRA_A = 'FFEBF5FB';
const C_ZEBRA_B = 'FFFDFEFE';
const C_GRAND = 'FFD5F5E3';
const NUM_FMT = '#,##0.00';
const DASH = '—';
/** Quantity cells of a room on an unscaled page say so instead of showing 0. */
const NOT_CALIBRATED = NOT_CALIBRATED_LABEL.replace(/^—\s*/, '');

const PLANS_SHEET = 'תוכניות';

function colLetter(n: number): string {
  let out = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function styleHeader(row: ExcelJS.Row) {
  row.eachCell({ includeEmpty: true }, (c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_HEADER } };
    c.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  row.height = 32;
}

function styleBody(row: ExcelJS.Row, argb: string, numericFrom: number) {
  row.eachCell({ includeEmpty: true }, (c, ci) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
    c.alignment = { horizontal: 'center' };
    if (ci >= numericFrom) c.numFmt = NUM_FMT;
  });
}

/** Column groups per category: m² net + order, and for skirting its running metres too. */
function categoryColumns(categories: ReportCategory[]) {
  return categories.flatMap((c) => {
    const label = REPORT_CATEGORY_LABELS[c];
    const cols: { category: ReportCategory; field: 'quantityM2' | 'orderM2' | 'lengthM' | 'orderLengthM'; header: string }[] = [
      { category: c, field: 'quantityM2', header: `${label} נטו (מ"ר)` },
      { category: c, field: 'orderM2', header: `${label} להזמנה (מ"ר)` },
    ];
    if (c === 'panels') {
      cols.push({ category: c, field: 'lengthM', header: `${label} נטו (מ"א)` });
      cols.push({ category: c, field: 'orderLengthM', header: `${label} להזמנה (מ"א)` });
    }
    return cols;
  });
}

/** Per plan: rooms, calibration, status and each category's totals, with a SUM row the summary sheet reads. */
function addPlansSheet(workbook: ExcelJS.Workbook, q: ProjectQuantities, categories: ReportCategory[]) {
  const sheet = workbook.addWorksheet(PLANS_SHEET, { views: [{ rightToLeft: true }] });
  const cols = categoryColumns(categories);
  const fixed = ['תוכנית', 'חדרים', 'עמודים מכוילים', 'חדרים ללא כיול', 'סטטוס'];
  styleHeader(sheet.addRow([...fixed, ...cols.map((c) => c.header)]));
  [22, 8, 12, 12, 18, ...cols.map(() => 15)].forEach((w, i) => (sheet.getColumn(i + 1).width = w));

  const first = sheet.rowCount + 1;
  q.plans.forEach((r, i) => {
    const row = sheet.addRow([
      r.plan.name,
      r.roomCount,
      r.calibratedPageCount,
      r.uncalibratedRoomCount,
      PLAN_STATUS_LABELS[r.status],
      ...cols.map((c) => r.byCategory[c.category]?.[c.field] ?? 0),
    ]);
    styleBody(row, i % 2 === 0 ? C_ZEBRA_A : C_ZEBRA_B, fixed.length + 1);
  });
  const last = sheet.rowCount;

  const totalRow = sheet.addRow(['סה"כ פרויקט']);
  cols.forEach((c, i) => {
    const ci = fixed.length + 1 + i;
    const L = colLetter(ci);
    const total = q.totals.find((t) => t.category === c.category)?.[c.field] ?? 0;
    totalRow.getCell(ci).value = { formula: `ROUND(SUM(${L}${first}:${L}${last}),2)`, result: total };
  });
  styleBody(totalRow, C_GRAND, fixed.length + 1);
  totalRow.font = { bold: true };

  // Where each category's totals landed, for the summary sheet's references.
  const totalCell = new Map(cols.map((c, i) => [`${c.category}:${c.field}`, `${sheetRef(PLANS_SHEET)}${colLetter(fixed.length + 1 + i)}${totalRow.number}`]));
  return totalCell;
}

function addSummarySheet(
  sheet: ExcelJS.Worksheet,
  project: Project,
  q: ProjectQuantities,
  totalCell: Map<string, string>
) {
  [22, 16, 18, 16, 18].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  const title = sheet.addRow([`כתב כמויות — ${project.name}`]);
  title.font = { bold: true, size: 14 };
  sheet.addRow([`${q.plans.length} תוכניות · ${new Date().toLocaleDateString('he-IL')}`]).font = { color: { argb: 'FF8B8F99' } };
  sheet.addRow([]);

  styleHeader(sheet.addRow(['פריט', 'כמות נטו (מ"ר)', 'להזמנה כולל פחת (מ"ר)', 'אורך נטו (מ"א)', 'אורך להזמנה (מ"א)']));
  q.totals.forEach((t, i) => {
    const row = sheet.addRow([t.label]);
    const ref = (field: string, result: number | null, ci: number) => {
      const cell = totalCell.get(`${t.category}:${field}`);
      row.getCell(ci).value = cell && result != null ? { formula: cell, result } : DASH;
    };
    ref('quantityM2', t.quantityM2, 2);
    ref('orderM2', t.orderM2, 3);
    ref('lengthM', t.lengthM, 4);
    ref('orderLengthM', t.orderLengthM, 5);
    styleBody(row, i % 2 === 0 ? C_ZEBRA_A : C_ZEBRA_B, 2);
  });

  if (q.uncalibratedRoomCount > 0) {
    sheet.addRow([]);
    const note = sheet.addRow([`שים לב: ${q.uncalibratedRoomCount} חדרים לא נכללו — העמוד שלהם אינו מכויל.`]);
    note.getCell(1).font = { bold: true, color: { argb: 'FF92400E' } };
  }
}

/** Every room of every plan: floor area, perimeter and each category's quantities. */
function addRoomsSheet(workbook: ExcelJS.Workbook, q: ProjectQuantities, categories: ReportCategory[]) {
  const sheet = workbook.addWorksheet('חדרים', { views: [{ rightToLeft: true }] });
  const cols = categoryColumns(categories);
  const fixed = ['תוכנית', 'דירה', 'חדר', 'שטח רצפה (מ"ר)', "היקף (מ')"];
  styleHeader(sheet.addRow([...fixed, ...cols.map((c) => c.header)]));
  [20, 8, 22, 14, 12, ...cols.map(() => 15)].forEach((w, i) => (sheet.getColumn(i + 1).width = w));

  let i = 0;
  for (const r of q.plans) {
    const roomsById = new Map(r.plan.rooms.map((room) => [room.id, room]));
    for (const s of r.summaries) {
      const room = roomsById.get(s.roomId)!;
      const { areaM2, perimeterM } = roomMetrics(room, r.plan.pages[room.pageNumber]?.calibration ?? null);
      const cell = (v: number | null) => (s.pageCalibrated ? (v ?? DASH) : NOT_CALIBRATED);
      const row = sheet.addRow([
        r.plan.name,
        s.apartmentNumber || DASH,
        s.roomName,
        cell(round(areaM2, 2)),
        cell(round(perimeterM, 2)),
        ...cols.map((c) => cell(roomCategoryQuantity(s, c.category)[c.field])),
      ]);
      styleBody(row, i++ % 2 === 0 ? C_ZEBRA_A : C_ZEBRA_B, 4);
    }
  }
}

/**
 * One row per work item: gross, openings deducted, net, waste and a live "to order" formula — the
 * detail behind every total. Skirting is listed in running metres (its unit), everything else in m².
 */
function addWorkItemsSheet(workbook: ExcelJS.Workbook, plans: Plan[]) {
  const sheet = workbook.addWorksheet('סוגי עבודה', { views: [{ rightToLeft: true }] });
  styleHeader(sheet.addRow(['תוכנית', 'דירה', 'חדר', 'סוג עבודה', 'יחידה', 'ברוטו', 'ניכוי פתחים', 'נטו', 'פחת (%)', 'להזמנה']));
  [20, 8, 22, 16, 8, 12, 13, 12, 10, 13].forEach((w, i) => (sheet.getColumn(i + 1).width = w));

  let i = 0;
  for (const plan of plans) {
    for (const room of plan.rooms) {
      const calibration = plan.pages[room.pageNumber]?.calibration ?? null;
      const calibrated = (calibration?.metersPerPixel ?? 0) > 0;
      const { areaM2, perimeterM } = roomMetrics(room, calibration);
      for (const item of room.workItems) {
        const def = workTypeDefinition(item.type);
        if (!def) continue;
        const calc = calculateWorkItem(item, room, areaM2, perimeterM, plan);
        const linear = calc.lengthM != null;
        const gross = linear ? calc.grossLengthM! : calc.grossM2;
        const deducted = linear ? calc.deductedLengthM! : calc.deductedM2;
        const net = linear ? calc.lengthM! : calc.netM2;
        const label = item.type === 'tiling' && item.tilingCategory === 'as' ? REPORT_CATEGORY_LABELS.tiling_as : def.label;
        const qty = (v: number) => (calibrated ? round(v, 2) : NOT_CALIBRATED);
        const waste = effectiveWastePercent(item, plan);
        const row = sheet.addRow([plan.name, room.apartmentNumber || DASH, room.name, label, def.unit, qty(gross), qty(deducted), qty(net), waste, null]);
        const r = row.number;
        row.getCell(10).value = {
          formula: `IF(ISNUMBER(H${r}),ROUND(H${r}*(1+I${r}/100),2),"${DASH}")`,
          result: calibrated ? round(net * (1 + waste / 100), 2) : DASH,
        };
        styleBody(row, i++ % 2 === 0 ? C_ZEBRA_A : C_ZEBRA_B, 6);
        row.getCell(9).numFmt = '0.##';
      }
    }
  }
}

/** The whole project in one workbook: summary, per-plan totals, rooms and work items. */
export async function exportProjectToExcel(project: Project, plans: Plan[]) {
  const buffer = await buildProjectWorkbook(project, plans).xlsx.writeBuffer();
  const safeName = project.name.replace(/[\\/:*?"<>|]/g, '_');
  saveAs(new Blob([buffer], { type: 'application/octet-stream' }), `כתב-כמויות-פרויקט-${safeName}.xlsx`);
}

/** The project workbook exactly as `exportProjectToExcel` saves it — built apart so tests can read it. */
export function buildProjectWorkbook(project: Project, plans: Plan[]): ExcelJS.Workbook {
  const q = buildProjectQuantities(plans);
  const categories = q.totals.map((t) => t.category);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BetterCalc';
  workbook.created = new Date();
  // Created first so it is the first tab; filled once the plans sheet exists to reference.
  const summary = workbook.addWorksheet('סיכום פרויקט', { views: [{ rightToLeft: true }] });
  const totalCell = addPlansSheet(workbook, q, categories);
  addSummarySheet(summary, project, q, totalCell);
  addRoomsSheet(workbook, q, categories);
  addWorkItemsSheet(workbook, plans);
  return workbook;
}
