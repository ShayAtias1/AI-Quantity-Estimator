import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { AreaKind, Measurement, Project, ReportCategoryTotal, RoomQuantitySummary } from '../types';
import { AREA_KIND_LABELS } from '../types';
import { numberAreaMeasurements } from './areaMeasurements';

const DASH = '—';
/** Written into quantity cells of a room whose page has no scale, so 0 is never implied. */
const NOT_CALIBRATED = 'לא כויל';

// Fill palette (matches the reference workbook "מטריצה מיכשווילי 2").
const C_HEADER = 'FF1F4E79'; // dark blue header (white bold text)
const C_ZEBRA_A = 'FFEBF5FB'; // dry room, even row
const C_ZEBRA_B = 'FFFDFEFE'; // dry room, odd row
const C_WET = 'FFFEF9E7'; // room with wall cladding (bathroom / wet)
const C_BALCONY = 'FFEAFAF1'; // AS tiling without cladding (balcony)
const C_TOTAL = 'FFD6E4F0'; // per-apartment totals block
const C_TOTAL_HDR = 'FFA9C4D9'; // per-apartment totals sub-header
const C_GRAND = 'FFD5F5E3'; // grand-total row on summary sheet

const NUM_FMT = '#,##0.00';

const DATA_HEADERS = [
  'דירה',
  'חדר',
  'שטח ריצוף רגיל (מ"ר)',
  'שטח ריצוף AS (מ"ר)',
  'שטח חיפוי קירות (מ"ר)',
  'שטח פנלים (מ"ר)',
  'פחת ריצוף רגיל (%)',
  'פחת ריצוף AS (%)',
  'פחת חיפוי (%)',
  'פחת פנלים (%)',
  'ריצוף רגיל להזמנה',
  'ריצוף AS להזמנה',
  'חיפוי להזמנה',
  'פנלים להזמנה',
  'הערות',
  // Appended last on purpose: the order formulas below address columns by letter (C..N), so the
  // panel length gets its own column P instead of shifting any of them.
  'אורך פנלים (מ"א)',
  'אורך פנלים להזמנה (מ"א)',
];
const DATA_WIDTHS = [8, 26, 17, 16, 18, 14, 15, 15, 12, 12, 15, 15, 13, 13, 26, 17, 21];

const SUMMARY_HEADERS = [
  'דירה',
  'ריצוף רגיל נטו (מ"ר)',
  'ריצוף רגיל להזמנה (מ"ר)',
  'ריצוף AS נטו (מ"ר)',
  'ריצוף AS להזמנה (מ"ר)',
  'חיפוי קירות נטו (מ"ר)',
  'חיפוי קירות להזמנה (מ"ר)',
  'פנלים נטו (מ"ר)',
  'פנלים להזמנה (מ"ר)',
];
const SUMMARY_WIDTHS = [10, 20, 22, 18, 20, 20, 22, 16, 18];

function setFill(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sumField(rooms: RoomQuantitySummary[], pick: (s: RoomQuantitySummary) => number | null): number {
  return round2(rooms.reduce((acc, s) => acc + (pick(s) ?? 0), 0));
}

const AREA_HEADERS = ['#', 'עמוד', 'סוג', 'אופן חישוב', "אורך (מ')", "גובה (מ')", 'שטח (מ"ר)'];
const AREA_WIDTHS = [6, 8, 14, 18, 14, 14, 14];

/** Adds a "הריסה ובנייה" sheet listing every kind-tagged area/wall measurement (independent of room data) plus per-kind and grand totals. */
function addAreaMeasurementSheet(workbook: ExcelJS.Workbook, measurements: Measurement[]) {
  const sheet = workbook.addWorksheet('הריסה ובנייה', { views: [{ rightToLeft: true }] });
  AREA_WIDTHS.forEach((w, i) => (sheet.getColumn(i + 1).width = w));

  const headerRow = sheet.addRow(AREA_HEADERS);
  headerRow.eachCell({ includeEmpty: true }, (c) => {
    setFill(c, C_HEADER);
    c.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  const numbers = numberAreaMeasurements(measurements);
  const kinds: AreaKind[] = ['demolition', 'construction'];
  let grandTotal = 0;
  for (const kind of kinds) {
    const rows = measurements.filter((m) => m.areaKind === kind);
    if (rows.length === 0) continue;
    let subtotal = 0;
    rows.forEach((m, i) => {
      const isWall = m.calcMode === 'wall';
      subtotal += m.areaM2 ?? 0;
      const row = sheet.addRow([
        numbers.get(m.id) ?? '',
        m.pageNumber,
        AREA_KIND_LABELS[kind],
        isWall ? 'קיר (אורך × גובה)' : 'שטח בפועל',
        isWall ? round2(m.wallLengthM ?? 0) : DASH,
        isWall ? round2(m.wallHeightM ?? 0) : DASH,
        round2(m.areaM2 ?? 0),
      ]);
      const argb = i % 2 === 0 ? C_ZEBRA_A : C_ZEBRA_B;
      row.eachCell({ includeEmpty: true }, (c) => {
        setFill(c, argb);
        c.alignment = { horizontal: 'center' };
      });
      row.getCell(5).numFmt = NUM_FMT;
      row.getCell(6).numFmt = NUM_FMT;
      row.getCell(7).numFmt = NUM_FMT;
    });
    grandTotal += subtotal;
    const totalRow = sheet.addRow([`סה"כ ${AREA_KIND_LABELS[kind]}`, '', '', '', '', '', round2(subtotal)]);
    totalRow.getCell(7).numFmt = NUM_FMT;
    totalRow.eachCell({ includeEmpty: true }, (c) => {
      setFill(c, C_TOTAL);
      c.font = { bold: true };
      c.alignment = { horizontal: 'center' };
    });
  }

  const grandRow = sheet.addRow(['סה"כ כללי', '', '', '', '', '', round2(grandTotal)]);
  grandRow.getCell(7).numFmt = NUM_FMT;
  grandRow.eachCell({ includeEmpty: true }, (c) => {
    setFill(c, C_GRAND);
    c.font = { bold: true };
    c.alignment = { horizontal: 'center' };
  });
}

interface ApartmentTotals {
  apartment: string;
  regRow: number;
  asRow: number;
  cladRow: number;
  panRow: number;
  netReg: number;
  ordReg: number;
  netAs: number;
  ordAs: number;
  netClad: number;
  ordClad: number;
  netPan: number;
  ordPan: number;
}

// _totals is kept for a stable call signature but is no longer needed:
// totals are now emitted as live SUM formulas per apartment + a grand total on the summary sheet.
export async function exportQuantitiesToExcel(
  project: Project,
  summaries: RoomQuantitySummary[],
  _totals: ReportCategoryTotal[],
  areaMeasurements: Measurement[] = []
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BetterCalc';
  workbook.created = new Date();

  if (summaries.length > 0) {
  // Created first so the tab order is [סיכום כולל, כתב כמויות]; populated after the data sheet.
  const summarySheet = workbook.addWorksheet('סיכום כולל', { views: [{ rightToLeft: true }] });
  const dataSheet = workbook.addWorksheet('כתב כמויות', { views: [{ rightToLeft: true }] });

  DATA_WIDTHS.forEach((w, i) => (dataSheet.getColumn(i + 1).width = w));
  SUMMARY_WIDTHS.forEach((w, i) => (summarySheet.getColumn(i + 1).width = w));

  // Group rooms by apartment, preserving first-seen order.
  const groups = new Map<string, RoomQuantitySummary[]>();
  const order: string[] = [];
  for (const s of summaries) {
    const key = s.apartmentNumber || '';
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(s);
  }

  const apartmentTotals: ApartmentTotals[] = [];

  // ---- Data sheet: one block per apartment ----
  for (const key of order) {
    const rooms = groups.get(key)!;

    const headerRow = dataSheet.addRow(DATA_HEADERS);
    headerRow.eachCell({ includeEmpty: true }, (c) => {
      setFill(c, C_HEADER);
      c.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    const firstDataRow = headerRow.number + 1;
    let lastDataRow = firstDataRow;

    for (const s of rooms) {
      // An uncalibrated page has no quantities to report — the cells say so in words instead of
      // printing 0. They stay text, so SUM() and the order formulas below simply skip them.
      const areaCell = (v: number | null) => (s.pageCalibrated ? v ?? DASH : NOT_CALIBRATED);
      const row = dataSheet.addRow([
        s.apartmentNumber,
        s.roomName,
        areaCell(s.tilingRegularAreaM2),
        areaCell(s.tilingAsAreaM2),
        areaCell(s.claddingAreaM2),
        areaCell(s.panelsAreaM2),
        s.tilingRegularWastePercent ?? DASH,
        s.tilingAsWastePercent ?? DASH,
        s.claddingWastePercent ?? DASH,
        s.panelsWastePercent ?? DASH,
        null,
        null,
        null,
        null,
        s.notes,
        areaCell(s.panelsLengthM),
        null,
      ]);
      const r = row.number;
      lastDataRow = r;

      // Order columns K–N as formulas: area × (1 + waste/100), rounded, "—" when no area.
      row.getCell(11).value = {
        formula: `IF(ISNUMBER(C${r}),ROUND(C${r}*(1+IF(ISNUMBER(G${r}),G${r},0)/100),2),"${DASH}")`,
        result: s.tilingRegularOrderM2 ?? DASH,
      };
      row.getCell(12).value = {
        formula: `IF(ISNUMBER(D${r}),ROUND(D${r}*(1+IF(ISNUMBER(H${r}),H${r},0)/100),2),"${DASH}")`,
        result: s.tilingAsOrderM2 ?? DASH,
      };
      row.getCell(13).value = {
        formula: `IF(ISNUMBER(E${r}),ROUND(E${r}*(1+IF(ISNUMBER(I${r}),I${r},0)/100),2),"${DASH}")`,
        result: s.claddingOrderM2 ?? DASH,
      };
      row.getCell(14).value = {
        formula: `IF(ISNUMBER(F${r}),ROUND(F${r}*(1+IF(ISNUMBER(J${r}),J${r},0)/100),2),"${DASH}")`,
        result: s.panelsOrderM2 ?? DASH,
      };

      // Row colour by room "type", derived from which quantities exist.
      const argb =
        s.claddingAreaM2 != null ? C_WET : s.tilingAsAreaM2 != null ? C_BALCONY : r % 2 === 0 ? C_ZEBRA_A : C_ZEBRA_B;
      row.eachCell({ includeEmpty: true }, (c) => setFill(c, argb));

      row.getCell(16).numFmt = NUM_FMT;
      row.getCell(16).alignment = { horizontal: 'center' };
      // Same shape as the m² order columns: length × (1 + waste/100), "—" when there is no length.
      row.getCell(17).value = {
        formula: `IF(ISNUMBER(P${r}),ROUND(P${r}*(1+IF(ISNUMBER(J${r}),J${r},0)/100),2),"${DASH}")`,
        result: s.panelsOrderLengthM ?? DASH,
      };
      row.getCell(17).numFmt = NUM_FMT;
      row.getCell(17).alignment = { horizontal: 'center' };
      for (let ci = 3; ci <= 14; ci++) {
        const cell = row.getCell(ci);
        cell.alignment = { horizontal: 'center' };
        if (ci <= 6 || ci >= 11) cell.numFmt = NUM_FMT;
      }
    }

    // Per-apartment totals block.
    dataSheet.addRow([]);
    const titleRow = dataSheet.addRow(['סה"כ']);
    setFill(titleRow.getCell(1), C_TOTAL);
    titleRow.getCell(1).font = { bold: true };

    const subHeader = dataSheet.addRow([
      'פריט',
      'כמות נטו (מ"ר)',
      'פחת (%)',
      'להזמנה (מ"ר)',
      'אורך (מ"א)',
      'אורך להזמנה (מ"א)',
    ]);
    subHeader.eachCell({ includeEmpty: true }, (c) => {
      setFill(c, C_TOTAL_HDR);
      c.font = { bold: true };
      c.alignment = { horizontal: 'center' };
    });

    const cats = [
      { label: 'ריצוף רגיל', areaCol: 'C', orderCol: 'K', net: sumField(rooms, (s) => s.tilingRegularAreaM2), ord: sumField(rooms, (s) => s.tilingRegularOrderM2) },
      { label: 'ריצוף AS', areaCol: 'D', orderCol: 'L', net: sumField(rooms, (s) => s.tilingAsAreaM2), ord: sumField(rooms, (s) => s.tilingAsOrderM2) },
      { label: 'חיפוי קירות', areaCol: 'E', orderCol: 'M', net: sumField(rooms, (s) => s.claddingAreaM2), ord: sumField(rooms, (s) => s.claddingOrderM2) },
      {
        label: 'פנלים',
        areaCol: 'F',
        orderCol: 'N',
        lengthCol: 'P',
        orderLengthCol: 'Q',
        net: sumField(rooms, (s) => s.panelsAreaM2),
        ord: sumField(rooms, (s) => s.panelsOrderM2),
      },
    ];
    const catRowNums: number[] = [];
    for (const cat of cats) {
      const row = dataSheet.addRow([cat.label, null, null, null, null, null]);
      catRowNums.push(row.number);
      // Panels are the only category with a linear reading; it sums the same rows, column P.
      if (cat.lengthCol) {
        row.getCell(5).value = {
          formula: `ROUND(SUM(${cat.lengthCol}${firstDataRow}:${cat.lengthCol}${lastDataRow}),2)`,
          result: sumField(rooms, (s) => s.panelsLengthM),
        };
        row.getCell(5).numFmt = NUM_FMT;
        row.getCell(5).alignment = { horizontal: 'center' };
        row.getCell(6).value = {
          formula: `ROUND(SUM(${cat.orderLengthCol}${firstDataRow}:${cat.orderLengthCol}${lastDataRow}),2)`,
          result: sumField(rooms, (s) => s.panelsOrderLengthM),
        };
        row.getCell(6).numFmt = NUM_FMT;
        row.getCell(6).alignment = { horizontal: 'center' };
      }
      row.getCell(2).value = { formula: `ROUND(SUM(${cat.areaCol}${firstDataRow}:${cat.areaCol}${lastDataRow}),2)`, result: cat.net };
      row.getCell(4).value = { formula: `ROUND(SUM(${cat.orderCol}${firstDataRow}:${cat.orderCol}${lastDataRow}),2)`, result: cat.ord };
      row.eachCell({ includeEmpty: true }, (c) => setFill(c, C_TOTAL));
      row.getCell(2).numFmt = NUM_FMT;
      row.getCell(4).numFmt = NUM_FMT;
      row.getCell(2).alignment = { horizontal: 'center' };
      row.getCell(4).alignment = { horizontal: 'center' };
    }

    apartmentTotals.push({
      apartment: key,
      regRow: catRowNums[0],
      asRow: catRowNums[1],
      cladRow: catRowNums[2],
      panRow: catRowNums[3],
      netReg: cats[0].net,
      ordReg: cats[0].ord,
      netAs: cats[1].net,
      ordAs: cats[1].ord,
      netClad: cats[2].net,
      ordClad: cats[2].ord,
      netPan: cats[3].net,
      ordPan: cats[3].ord,
    });

    dataSheet.addRow([]);
  }

  // ---- Summary sheet: one row per apartment, referencing the data sheet's totals ----
  const summaryHeader = summarySheet.addRow(SUMMARY_HEADERS);
  summaryHeader.eachCell({ includeEmpty: true }, (c) => {
    setFill(c, C_HEADER);
    c.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  const REF = "'כתב כמויות'";
  for (const t of apartmentTotals) {
    const row = summarySheet.addRow([t.apartment, null, null, null, null, null, null, null, null]);
    const rn = row.number;
    row.getCell(2).value = { formula: `${REF}!B${t.regRow}`, result: t.netReg };
    row.getCell(3).value = { formula: `${REF}!D${t.regRow}`, result: t.ordReg };
    row.getCell(4).value = { formula: `${REF}!B${t.asRow}`, result: t.netAs };
    row.getCell(5).value = { formula: `${REF}!D${t.asRow}`, result: t.ordAs };
    row.getCell(6).value = { formula: `${REF}!B${t.cladRow}`, result: t.netClad };
    row.getCell(7).value = { formula: `${REF}!D${t.cladRow}`, result: t.ordClad };
    row.getCell(8).value = { formula: `${REF}!B${t.panRow}`, result: t.netPan };
    row.getCell(9).value = { formula: `${REF}!D${t.panRow}`, result: t.ordPan };

    const argb = rn % 2 === 0 ? C_ZEBRA_A : C_ZEBRA_B;
    row.eachCell({ includeEmpty: true }, (c) => setFill(c, argb));
    for (let ci = 2; ci <= 9; ci++) {
      row.getCell(ci).numFmt = NUM_FMT;
      row.getCell(ci).alignment = { horizontal: 'center' };
    }
  }

  if (apartmentTotals.length > 0) {
    const firstSumRow = summaryHeader.number + 1;
    const lastSumRow = summarySheet.rowCount;
    // Cached grand-total results (col order B..I), computed directly from the per-apartment aggregates.
    const grandOrder = [
      round2(apartmentTotals.reduce((a, t) => a + t.netReg, 0)),
      round2(apartmentTotals.reduce((a, t) => a + t.ordReg, 0)),
      round2(apartmentTotals.reduce((a, t) => a + t.netAs, 0)),
      round2(apartmentTotals.reduce((a, t) => a + t.ordAs, 0)),
      round2(apartmentTotals.reduce((a, t) => a + t.netClad, 0)),
      round2(apartmentTotals.reduce((a, t) => a + t.ordClad, 0)),
      round2(apartmentTotals.reduce((a, t) => a + t.netPan, 0)),
      round2(apartmentTotals.reduce((a, t) => a + t.ordPan, 0)),
    ];

    const grand = summarySheet.addRow(['סה"כ כולל', null, null, null, null, null, null, null, null]);
    for (let ci = 2; ci <= 9; ci++) {
      const col = String.fromCharCode(64 + ci); // B..I
      grand.getCell(ci).value = {
        formula: `ROUND(SUM(${col}${firstSumRow}:${col}${lastSumRow}),2)`,
        result: grandOrder[ci - 2],
      };
      grand.getCell(ci).numFmt = NUM_FMT;
      grand.getCell(ci).alignment = { horizontal: 'center' };
    }
    grand.eachCell({ includeEmpty: true }, (c) => {
      setFill(c, C_GRAND);
      c.font = { bold: true };
    });
  }

  // Say plainly that the totals above are missing whatever could not be calculated.
  const uncalibratedRooms = summaries.filter((s) => !s.pageCalibrated);
  if (uncalibratedRooms.length > 0) {
    summarySheet.addRow([]);
    const note = summarySheet.addRow([
      `שים לב: ${uncalibratedRooms.length} חדרים לא נכללו בסיכום — העמוד שלהם אינו מכויל ולא ניתן לחשב את כמויותיהם (${uncalibratedRooms
        .map((s) => s.roomName || 'ללא שם')
        .join(', ')}).`,
    ]);
    note.getCell(1).font = { bold: true, color: { argb: 'FF92400E' } };
  }
  }

  if (areaMeasurements.length > 0) {
    addAreaMeasurementSheet(workbook, areaMeasurements);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const safeName = project.name.replace(/[\\/:*?"<>|]/g, '_');
  saveAs(blob, `כתב-כמויות-${safeName}.xlsx`);
}
