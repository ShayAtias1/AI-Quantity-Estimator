import { PDFDocument } from 'pdf-lib';
import { saveAs } from 'file-saver';
import type { Project, ReportCategoryTotal, RoomQuantitySummary } from '../types';
import { DEFAULT_AREA_KIND_COLORS, REPORT_CATEGORY_LABELS } from '../types';
import { loadPdfPlanSource } from './planSource';
import { loadPdfBlob } from '../db/database';
import { groupSummariesByApartment } from './quantities';
import { polygonCentroid } from './geometry';
import { drawMarkupOnCanvas, orderMarkups } from './drawMarkup';
import { drawMeasurementOnCanvas } from './drawMeasurement';
import { numberAreaMeasurements } from './areaMeasurements';
import { buildAreaMeasurementTablePages } from './areaMeasurementTable';

const DASH = '—';
/** Printed in quantity cells of a room whose page has no scale, so 0 is never implied. */
const NOT_CALIBRATED = 'לא כויל';
const FONT = "'Segoe UI', sans-serif";

// Same palette as the Excel export, for a consistent look across formats.
const C_HEADER = '#1F4E79';
const C_ZEBRA_A = '#EBF5FB';
const C_ZEBRA_B = '#FDFEFE';
const C_WET = '#FEF9E7';
const C_BALCONY = '#EAFAF1';
const C_TOTAL = '#D6E4F0';
const C_TOTAL_HDR = '#A9C4D9';
const C_GRAND = '#D5F5E3';
const C_BORDER = '#E2E8F0';

const DATA_HEADERS = [
  'דירה',
  'חדר',
  'שטח ריצוף רגיל',
  'שטח ריצוף AS',
  'שטח חיפוי',
  'אורך פנלים (מ"א)',
  'שטח פנלים',
  'פחת רגיל %',
  'פחת AS %',
  'פחת חיפוי %',
  'פחת פנלים %',
  'ריצוף רגיל להזמנה',
  'ריצוף AS להזמנה',
  'חיפוי להזמנה',
  'אורך פנלים להזמנה (מ"א)',
  'פנלים להזמנה',
  'הערות',
];
/**
 * Builds a summary row whose cells land under the matching data columns. Kept as one helper so the
 * totals stay aligned with DATA_HEADERS whenever a column is added.
 */
function totalsRow(cells: {
  label: string;
  length?: string;
  net?: string;
  waste?: string;
  order?: string;
  orderLength?: string;
}): string[] {
  const row = new Array<string>(DATA_HEADERS.length).fill('');
  row[0] = cells.label;
  row[2] = cells.net ?? '';
  row[5] = cells.length ?? '';
  row[7] = cells.waste ?? '';
  row[11] = cells.order ?? '';
  row[14] = cells.orderLength ?? '';
  return row;
}

const DATA_WEIGHTS = [8, 18, 13, 12, 12, 12, 11, 10, 10, 10, 10, 12, 12, 11, 13, 11, 17];

/** Renders one PDF-source page (the plan itself) with its rooms overlaid, as a standalone framed image. */
async function renderFramedPlanPage(
  project: Project,
  pageNumber: number,
  mult: number,
  showMarkings: boolean,
  showMeasurements: boolean,
  areaNumbers: Map<string, number>
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  let source;
  try {
    ({ source } = await loadPdfPlanSource(project.id, () => loadPdfBlob(project.id), pageNumber));
  } catch {
    return null;
  }
  const planCanvas = document.createElement('canvas');
  const handle = source.render(planCanvas, mult);
  await handle.promise;

  const headerH = 60 * mult;
  const canvas = document.createElement('canvas');
  canvas.width = planCanvas.width;
  canvas.height = planCanvas.height + headerH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f172a';
  ctx.font = `bold ${18 * mult}px ${FONT}`;
  ctx.fillText(project.name, canvas.width - 16 * mult, 26 * mult);
  ctx.fillStyle = '#8b8f99';
  ctx.font = `${12 * mult}px ${FONT}`;
  ctx.fillText(`עמוד תוכנית ${pageNumber} · ${new Date().toLocaleDateString('he-IL')}`, canvas.width - 16 * mult, 46 * mult);

  ctx.drawImage(planCanvas, 0, headerH);

  if (showMarkings) {
    const rooms = project.rooms.filter((r) => r.pageNumber === pageNumber && r.points.length >= 3);
    for (const r of rooms) {
      ctx.beginPath();
      r.points.forEach((p, i) => {
        const x = p.x * mult;
        const y = p.y * mult + headerH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = r.color;
      ctx.globalAlpha = 0.22;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2 * mult;
      ctx.stroke();

      const centroid = polygonCentroid(r.points);
      const labelX = centroid.x * mult;
      const labelY = centroid.y * mult + headerH;
      ctx.font = `bold ${10.5 * mult}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3 * mult;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(r.name, labelX, labelY);
      ctx.fillStyle = r.color;
      ctx.fillText(r.name, labelX, labelY);
      ctx.textBaseline = 'alphabetic';
    }

  }

  if (showMeasurements) {
    const areaKindColors = project.areaKindColors ?? DEFAULT_AREA_KIND_COLORS;
    const measurements = (project.measurements ?? []).filter((m) => m.pageNumber === pageNumber);
    if (measurements.length > 0) {
      ctx.save();
      ctx.translate(0, headerH);
      for (const m of measurements) {
        drawMeasurementOnCanvas(ctx, m, mult, 0, 0, m.areaKind ? areaKindColors[m.areaKind] : undefined, areaNumbers.get(m.id));
      }
      ctx.restore();
    }
  }

  if (showMarkings) {
    const markups = (project.markups ?? []).filter((m) => m.pageNumber === pageNumber);
    if (markups.length > 0) {
      ctx.save();
      ctx.translate(0, headerH);
      for (const m of orderMarkups(markups)) drawMarkupOnCanvas(ctx, m, mult, 0, 0);
      ctx.restore();
    }
  }

  return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
}

/** Builds the printable quantities-table pages (one canvas per page) as PNG data URLs. */
function buildQuantityTablePages(project: Project, summaries: RoomQuantitySummary[], totals: ReportCategoryTotal[]): { dataUrl: string; width: number; height: number }[] {
  const PAGE_W = 1600;
  const PAGE_H = 1132;
  const MARGIN = 40;
  const HEADER_ROW_H = 40;
  const ROW_H = 32;
  const usableWidth = PAGE_W - MARGIN * 2;
  const totalWeight = DATA_WEIGHTS.reduce((a, b) => a + b, 0);
  const colWidths = DATA_WEIGHTS.map((w) => (usableWidth * w) / totalWeight);

  const pages: { dataUrl: string; width: number; height: number }[] = [];
  let ctx: CanvasRenderingContext2D;
  let y = 0;

  const drawRow = (cells: string[], bg: string, opts?: { bold?: boolean; color?: string }) => {
    ctx.fillStyle = bg;
    ctx.fillRect(MARGIN, y, usableWidth, ROW_H);
    ctx.strokeStyle = C_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(MARGIN, y, usableWidth, ROW_H);
    ctx.fillStyle = opts?.color ?? '#1e293b';
    ctx.font = `${opts?.bold ? 'bold ' : ''}12px ${FONT}`;
    ctx.textAlign = 'center';
    let x = PAGE_W - MARGIN;
    cells.forEach((cell, i) => {
      const w = colWidths[i] ?? 0;
      ctx.fillText(cell, x - w / 2, y + ROW_H / 2 + 4, w - 6);
      x -= w;
    });
    y += ROW_H;
  };

  const drawColumnHeader = () => {
    ctx.fillStyle = C_HEADER;
    ctx.fillRect(MARGIN, y, usableWidth, HEADER_ROW_H);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 12.5px ${FONT}`;
    ctx.textAlign = 'center';
    let x = PAGE_W - MARGIN;
    DATA_HEADERS.forEach((label, i) => {
      const w = colWidths[i];
      ctx.fillText(label, x - w / 2, y + HEADER_ROW_H / 2 + 4, w - 6);
      x -= w;
    });
    y += HEADER_ROW_H;
  };

  const newPage = () => {
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    const c = canvas.getContext('2d');
    if (!c) throw new Error('2D context unavailable');
    ctx = c;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0f172a';
    ctx.font = `bold 20px ${FONT}`;
    ctx.fillText(`כתב כמויות — ${project.name}`, PAGE_W - MARGIN, 40);
    ctx.fillStyle = '#8b8f99';
    ctx.font = `12px ${FONT}`;
    ctx.fillText(new Date().toLocaleDateString('he-IL'), PAGE_W - MARGIN, 60);
    y = 84;
    drawColumnHeader();
    pages.push({ dataUrl: '', width: PAGE_W, height: PAGE_H });
  };

  const remainingRows = () => Math.floor((PAGE_H - MARGIN - y) / ROW_H);
  const finalizeCurrentPage = () => {
    pages[pages.length - 1] = { dataUrl: (ctx.canvas as HTMLCanvasElement).toDataURL('image/png'), width: PAGE_W, height: PAGE_H };
  };
  const ensureRoom = (rows: number) => {
    if (remainingRows() < rows) {
      finalizeCurrentPage();
      newPage();
    }
  };

  const num = (v: number | null) => (v == null ? DASH : `${v}`);
  const pct = (v: number | null) => (v == null ? DASH : `${v}%`);
  /** Quantity cell of a room whose page has no scale: says why it is empty instead of printing 0. */
  const qty = (s: RoomQuantitySummary, v: number | null) => (s.pageCalibrated ? num(v) : NOT_CALIBRATED);

  newPage();
  const groups = groupSummariesByApartment(summaries);
  for (const group of groups) {
    group.rooms.forEach((s, i) => {
      ensureRoom(1);
      const bg = s.claddingAreaM2 != null ? C_WET : s.tilingAsAreaM2 != null ? C_BALCONY : i % 2 === 0 ? C_ZEBRA_A : C_ZEBRA_B;
      drawRow(
        [
          s.apartmentNumber || DASH,
          s.roomName,
          qty(s, s.tilingRegularAreaM2),
          qty(s, s.tilingAsAreaM2),
          qty(s, s.claddingAreaM2),
          qty(s, s.panelsLengthM),
          qty(s, s.panelsAreaM2),
          pct(s.tilingRegularWastePercent),
          pct(s.tilingAsWastePercent),
          pct(s.claddingWastePercent),
          pct(s.panelsWastePercent),
          qty(s, s.tilingRegularOrderM2),
          qty(s, s.tilingAsOrderM2),
          qty(s, s.claddingOrderM2),
          qty(s, s.panelsOrderLengthM),
          qty(s, s.panelsOrderM2),
          s.notes || DASH,
        ],
        bg
      );
    });

    const cats = [
      { label: 'ריצוף רגיל', net: group.rooms.reduce((a, s) => a + (s.tilingRegularAreaM2 ?? 0), 0), ord: group.rooms.reduce((a, s) => a + (s.tilingRegularOrderM2 ?? 0), 0), len: null as number | null, ordLen: null as number | null },
      { label: 'ריצוף AS', net: group.rooms.reduce((a, s) => a + (s.tilingAsAreaM2 ?? 0), 0), ord: group.rooms.reduce((a, s) => a + (s.tilingAsOrderM2 ?? 0), 0), len: null as number | null, ordLen: null as number | null },
      { label: 'חיפוי קירות', net: group.rooms.reduce((a, s) => a + (s.claddingAreaM2 ?? 0), 0), ord: group.rooms.reduce((a, s) => a + (s.claddingOrderM2 ?? 0), 0), len: null as number | null, ordLen: null as number | null },
      {
        label: 'פנלים',
        net: group.rooms.reduce((a, s) => a + (s.panelsAreaM2 ?? 0), 0),
        ord: group.rooms.reduce((a, s) => a + (s.panelsOrderM2 ?? 0), 0),
        len: group.rooms.reduce((a, s) => a + (s.panelsLengthM ?? 0), 0),
        ordLen: group.rooms.reduce((a, s) => a + (s.panelsOrderLengthM ?? 0), 0),
      },
    ];
    ensureRoom(2 + cats.length);
    y += ROW_H * 0.3;
    drawRow(totalsRow({ label: `סה"כ דירה ${group.apartment || DASH}` }), C_TOTAL, { bold: true });
    drawRow(
      totalsRow({
        label: 'פריט',
        length: 'אורך (מ"א)',
        net: 'כמות נטו (מ"ר)',
        orderLength: 'אורך להזמנה (מ"א)',
        order: 'להזמנה (מ"ר)',
      }),
      C_TOTAL_HDR,
      { bold: true }
    );
    for (const cat of cats) {
      drawRow(
        totalsRow({
          label: cat.label,
          length: cat.len == null ? '' : `${Math.round(cat.len * 100) / 100}`,
          net: `${Math.round(cat.net * 100) / 100}`,
          orderLength: cat.ordLen == null ? '' : `${Math.round(cat.ordLen * 100) / 100}`,
          order: `${Math.round(cat.ord * 100) / 100}`,
        }),
        C_TOTAL
      );
    }
    y += ROW_H * 0.3;
  }

  // Grand-totals block.
  ensureRoom(2 + totals.length);
  drawRow(totalsRow({ label: 'סה"כ כללי לפרויקט' }), C_GRAND, { bold: true });
  drawRow(
    totalsRow({
      label: 'פריט',
      length: 'אורך (מ"א)',
      net: 'כמות נטו (מ"ר)',
      waste: 'פחת %',
      orderLength: 'אורך להזמנה (מ"א)',
      order: 'להזמנה (מ"ר)',
    }),
    C_TOTAL_HDR,
    { bold: true }
  );
  for (const t of totals) {
    drawRow(
      totalsRow({
        label: REPORT_CATEGORY_LABELS[t.category],
        length: t.lengthM == null ? '' : `${t.lengthM}`,
        net: `${t.quantityM2}`,
        waste: `${t.wastePercent}%`,
        orderLength: t.orderLengthM == null ? '' : `${t.orderLengthM}`,
        order: `${t.orderM2}`,
      }),
      C_GRAND
    );
  }

  // Say plainly that rooms which could not be calculated are missing from those totals.
  const uncalibratedCount = summaries.filter((s) => !s.pageCalibrated).length;
  if (uncalibratedCount > 0) {
    ensureRoom(1);
    drawRow(
      totalsRow({ label: `שים לב: ${uncalibratedCount} חדרים לא נכללו בסיכום — העמוד שלהם אינו מכויל` }),
      C_TOTAL_HDR,
      { bold: true, color: '#92400e' }
    );
  }

  finalizeCurrentPage();
  return pages;
}

/** Page numbers with any exportable content (rooms, markups, or measurements), sorted ascending. */
export function getExportablePageNumbers(project: Project): number[] {
  return Array.from(
    new Set([
      ...project.rooms.map((r) => r.pageNumber),
      ...(project.markups ?? []).map((m) => m.pageNumber),
      ...(project.measurements ?? []).map((m) => m.pageNumber),
    ])
  ).sort((a, b) => a - b);
}

export async function exportQuantitiesToPdf(
  project: Project,
  summaries: RoomQuantitySummary[],
  totals: ReportCategoryTotal[],
  showRoomMarkings: boolean = true,
  pageNumbers?: number[],
  showMeasurements: boolean = true
) {
  const pdfDoc = await PDFDocument.create();
  const mult = 2;

  const allAreaMeasurements = (project.measurements ?? []).filter((m) => m.tool === 'area' && m.areaKind && typeof m.areaM2 === 'number');

  const pageNumbersWithContent = getExportablePageNumbers(project).filter((p) => !pageNumbers || pageNumbers.includes(p));
  // Each page gets its own area/wall breakdown table, numbered independently, right after that page's plan image —
  // rather than one combined table for the whole multi-page project.
  for (const pageNumber of pageNumbersWithContent) {
    const pageAreaMeasurements = allAreaMeasurements.filter((m) => m.pageNumber === pageNumber);
    const pageAreaNumbers = numberAreaMeasurements(pageAreaMeasurements);

    const framed = await renderFramedPlanPage(project, pageNumber, mult, showRoomMarkings, showMeasurements, pageAreaNumbers);
    if (framed) {
      const pngBytes = await fetch(framed.dataUrl).then((r) => r.arrayBuffer());
      const pngImage = await pdfDoc.embedPng(pngBytes);
      const page = pdfDoc.addPage([framed.width, framed.height]);
      page.drawImage(pngImage, { x: 0, y: 0, width: framed.width, height: framed.height });
    }

    if (showMeasurements && pageAreaMeasurements.length > 0) {
      const areaTablePages = buildAreaMeasurementTablePages(`${project.name} — עמוד ${pageNumber}`, pageAreaMeasurements);
      for (const tp of areaTablePages) {
        const pngBytes = await fetch(tp.dataUrl).then((r) => r.arrayBuffer());
        const pngImage = await pdfDoc.embedPng(pngBytes);
        const page = pdfDoc.addPage([tp.width, tp.height]);
        page.drawImage(pngImage, { x: 0, y: 0, width: tp.width, height: tp.height });
      }
    }
  }

  const tablePages = summaries.length > 0 ? buildQuantityTablePages(project, summaries, totals) : [];
  for (const tp of tablePages) {
    const pngBytes = await fetch(tp.dataUrl).then((r) => r.arrayBuffer());
    const pngImage = await pdfDoc.embedPng(pngBytes);
    const page = pdfDoc.addPage([tp.width, tp.height]);
    page.drawImage(pngImage, { x: 0, y: 0, width: tp.width, height: tp.height });
  }

  const bytes = await pdfDoc.save();
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
    type: 'application/pdf',
  });
  const safeName = project.name.replace(/[\\/:*?"<>|]/g, '_');
  saveAs(blob, `דוח-כמויות-${safeName}.pdf`);
}
