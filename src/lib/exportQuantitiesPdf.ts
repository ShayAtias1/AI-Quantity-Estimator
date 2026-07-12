import { PDFDocument } from 'pdf-lib';
import { saveAs } from 'file-saver';
import type { Project, ReportCategoryTotal, RoomQuantitySummary } from '../types';
import { REPORT_CATEGORY_LABELS } from '../types';
import { loadPdfPlanSource } from './planSource';
import { loadPdfBlob } from '../db/database';
import { groupSummariesByApartment } from './quantities';

const DASH = '—';
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
  'שטח פנלים',
  'פחת רגיל %',
  'פחת AS %',
  'פחת חיפוי %',
  'פחת פנלים %',
  'ריצוף רגיל להזמנה',
  'ריצוף AS להזמנה',
  'חיפוי להזמנה',
  'פנלים להזמנה',
  'הערות',
];
const DATA_WEIGHTS = [8, 20, 15, 14, 14, 12, 11, 11, 11, 11, 14, 14, 13, 13, 22];

/** Renders one PDF-source page (the plan itself) with its rooms overlaid, as a standalone framed image. */
async function renderFramedPlanPage(project: Project, pageNumber: number, mult: number): Promise<{ dataUrl: string; width: number; height: number } | null> {
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

    const labelX = r.points[0].x * mult;
    const labelY = r.points[0].y * mult + headerH - 8 * mult;
    ctx.font = `bold ${13 * mult}px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.lineWidth = 3 * mult;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText(r.name, labelX, labelY);
    ctx.fillStyle = r.color;
    ctx.fillText(r.name, labelX, labelY);
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
          num(s.tilingRegularAreaM2),
          num(s.tilingAsAreaM2),
          num(s.claddingAreaM2),
          num(s.panelsAreaM2),
          pct(s.tilingRegularWastePercent),
          pct(s.tilingAsWastePercent),
          pct(s.claddingWastePercent),
          pct(s.panelsWastePercent),
          num(s.tilingRegularOrderM2),
          num(s.tilingAsOrderM2),
          num(s.claddingOrderM2),
          num(s.panelsOrderM2),
          s.notes || DASH,
        ],
        bg
      );
    });

    const cats = [
      { label: 'ריצוף רגיל', net: group.rooms.reduce((a, s) => a + (s.tilingRegularAreaM2 ?? 0), 0), ord: group.rooms.reduce((a, s) => a + (s.tilingRegularOrderM2 ?? 0), 0) },
      { label: 'ריצוף AS', net: group.rooms.reduce((a, s) => a + (s.tilingAsAreaM2 ?? 0), 0), ord: group.rooms.reduce((a, s) => a + (s.tilingAsOrderM2 ?? 0), 0) },
      { label: 'חיפוי קירות', net: group.rooms.reduce((a, s) => a + (s.claddingAreaM2 ?? 0), 0), ord: group.rooms.reduce((a, s) => a + (s.claddingOrderM2 ?? 0), 0) },
      { label: 'פנלים', net: group.rooms.reduce((a, s) => a + (s.panelsAreaM2 ?? 0), 0), ord: group.rooms.reduce((a, s) => a + (s.panelsOrderM2 ?? 0), 0) },
    ];
    ensureRoom(2 + cats.length);
    y += ROW_H * 0.3;
    drawRow([`סה"כ דירה ${group.apartment || DASH}`, '', '', '', '', '', '', '', '', '', '', '', '', '', ''], C_TOTAL, { bold: true });
    drawRow(['פריט', '', 'כמות נטו (מ"ר)', '', '', '', '', '', '', '', 'להזמנה (מ"ר)', '', '', '', ''], C_TOTAL_HDR, { bold: true });
    for (const cat of cats) {
      drawRow(
        [cat.label, '', `${Math.round(cat.net * 100) / 100}`, '', '', '', '', '', '', '', `${Math.round(cat.ord * 100) / 100}`, '', '', '', ''],
        C_TOTAL
      );
    }
    y += ROW_H * 0.3;
  }

  // Grand-totals block.
  ensureRoom(2 + totals.length);
  drawRow(['סה"כ כללי לפרויקט', '', '', '', '', '', '', '', '', '', '', '', '', '', ''], C_GRAND, { bold: true });
  drawRow(['פריט', '', 'כמות נטו (מ"ר)', '', '', '', 'פחת %', '', '', '', 'להזמנה (מ"ר)', '', '', '', ''], C_TOTAL_HDR, { bold: true });
  for (const t of totals) {
    drawRow(
      [REPORT_CATEGORY_LABELS[t.category], '', `${t.quantityM2}`, '', '', '', `${t.wastePercent}%`, '', '', '', `${t.orderM2}`, '', '', '', ''],
      C_GRAND
    );
  }

  finalizeCurrentPage();
  return pages;
}

export async function exportQuantitiesToPdf(project: Project, summaries: RoomQuantitySummary[], totals: ReportCategoryTotal[]) {
  const pdfDoc = await PDFDocument.create();
  const mult = 2;

  const pageNumbersWithRooms = Array.from(new Set(project.rooms.map((r) => r.pageNumber))).sort((a, b) => a - b);
  for (const pageNumber of pageNumbersWithRooms) {
    const framed = await renderFramedPlanPage(project, pageNumber, mult);
    if (!framed) continue;
    const pngBytes = await fetch(framed.dataUrl).then((r) => r.arrayBuffer());
    const pngImage = await pdfDoc.embedPng(pngBytes);
    const page = pdfDoc.addPage([framed.width, framed.height]);
    page.drawImage(pngImage, { x: 0, y: 0, width: framed.width, height: framed.height });
  }

  const tablePages = buildQuantityTablePages(project, summaries, totals);
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
