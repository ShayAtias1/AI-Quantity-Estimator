import { round } from './geometry';
import { numberAreaMeasurements, type AreaMeasurementLike } from './areaMeasurements';
import { changeTotals } from './changeMeasurements';

interface WallMeasurementLike extends AreaMeasurementLike {
  calcMode?: 'footprint' | 'wall';
  wallLengthM?: number;
  wallHeightM?: number;
  /** Revision Compare stamps every measurement with the source page it belongs to. */
  pageNumber?: number;
}

export interface AreaTableOptions {
  /**
   * Numbering to print in the `#` column. Revision Compare passes the numbering built from the
   * revision's whole measurement list, so a page-filtered table still shows the numbers drawn on
   * the plan. Omitted, the table numbers the rows it was given.
   */
  numbering?: Map<string, number>;
  /** Adds a source-page column — for multi-page comparisons, where the page matters. */
  showPage?: boolean;
}

const AREA_KIND_LABELS: Record<'demolition' | 'construction', string> = {
  demolition: 'הריסה',
  construction: 'בנייה חדשה',
};

const DASH = '—';
const FONT = "'Segoe UI', sans-serif";

const C_HEADER = '#1F4E79';
const C_ZEBRA_A = '#EBF5FB';
const C_ZEBRA_B = '#FDFEFE';
const C_TOTAL = '#D6E4F0';
const C_GRAND = '#D5F5E3';
const C_BORDER = '#E2E8F0';

const HEADERS = ['#', 'סוג', 'אופן חישוב', "אורך (מ')", "גובה (מ')", 'שטח (מ"ר)'];
const WEIGHTS = [8, 22, 24, 16, 16, 24];
const HEADERS_WITH_PAGE = ['#', 'סוג', 'עמוד', 'אופן חישוב', "אורך (מ')", "גובה (מ')", 'שטח (מ"ר)'];
const WEIGHTS_WITH_PAGE = [7, 20, 10, 21, 14, 14, 24];

/**
 * Builds the printable demolition/construction area breakdown (one canvas per page) as PNG data
 * URLs — one row per marked area/wall (with the same numbering as the on-canvas wall labels), plus
 * per-kind and grand totals. Shared by both the quantity-takeoff and Revision Compare PDF exports.
 */
export function buildAreaMeasurementTablePages<T extends WallMeasurementLike>(
  title: string,
  measurements: T[],
  options: AreaTableOptions = {}
): { dataUrl: string; width: number; height: number }[] {
  const showPage = !!options.showPage;
  const headers = showPage ? HEADERS_WITH_PAGE : HEADERS;
  const weights = showPage ? WEIGHTS_WITH_PAGE : WEIGHTS;
  const PAGE_W = 1200;
  const PAGE_H = 1132;
  const MARGIN = 40;
  const HEADER_ROW_H = 40;
  const ROW_H = 32;
  const usableWidth = PAGE_W - MARGIN * 2;
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const colWidths = weights.map((w) => (usableWidth * w) / totalWeight);

  const pages: { dataUrl: string; width: number; height: number }[] = [];
  let ctx: CanvasRenderingContext2D;
  let y = 0;

  const drawRow = (cells: string[], bg: string, opts?: { bold?: boolean }) => {
    ctx.fillStyle = bg;
    ctx.fillRect(MARGIN, y, usableWidth, ROW_H);
    ctx.strokeStyle = C_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(MARGIN, y, usableWidth, ROW_H);
    ctx.fillStyle = '#1e293b';
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
    headers.forEach((label, i) => {
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
    ctx.fillText(`טבלת שטחי הריסה ובנייה — ${title}`, PAGE_W - MARGIN, 40);
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

  newPage();

  const kinds: Array<'demolition' | 'construction'> = ['demolition', 'construction'];
  const numbers = options.numbering ?? numberAreaMeasurements(measurements);
  // Padded to the column count so the same row builder serves both layouts.
  const cells = (n: string, kind: string, page: string, mode: string, len: string, h: string, area: string) =>
    showPage ? [n, kind, page, mode, len, h, area] : [n, kind, mode, len, h, area];
  let grandTotal = 0;
  let grandLength = 0;
  for (const kind of kinds) {
    const rows = measurements.filter((m) => m.areaKind === kind);
    if (rows.length === 0) continue;
    // Summed by the same helper the Changes panel uses, so the report and the panel cannot drift
    // apart — including the rule that only wall-mode rows carry running metres.
    const { areaM2: subtotal, lengthM: subLength } = changeTotals(rows, kind);
    rows.forEach((m, i) => {
      ensureRoom(1);
      const isWall = m.calcMode === 'wall';
      drawRow(
        cells(
          `${numbers.get(m.id) ?? ''}`,
          AREA_KIND_LABELS[kind],
          m.pageNumber === undefined ? DASH : `${m.pageNumber}`,
          isWall ? 'קיר (אורך × גובה)' : 'שטח בפועל',
          isWall ? `${round(m.wallLengthM ?? 0, 2)}` : DASH,
          isWall ? `${round(m.wallHeightM ?? 0, 2)}` : DASH,
          `${round(m.areaM2 ?? 0, 2)}`
        ),
        i % 2 === 0 ? C_ZEBRA_A : C_ZEBRA_B
      );
    });
    grandTotal += subtotal;
    grandLength += subLength;
    ensureRoom(1);
    drawRow(
      cells(`סה"כ ${AREA_KIND_LABELS[kind]}`, '', '', '', subLength > 0 ? `${round(subLength, 2)}` : DASH, '', `${round(subtotal, 2)}`),
      C_TOTAL,
      { bold: true }
    );
  }

  ensureRoom(1);
  drawRow(
    cells('סה"כ כללי', '', '', '', grandLength > 0 ? `${round(grandLength, 2)}` : DASH, '', `${round(grandTotal, 2)}`),
    C_GRAND,
    { bold: true }
  );

  finalizeCurrentPage();
  return pages;
}
