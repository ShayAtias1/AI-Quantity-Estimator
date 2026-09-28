import type { PDFDocument } from 'pdf-lib';
import { round } from './geometry';
import { drawLogo, PdfPainter, REPORT_LOGO_HEIGHT, type ReportFonts } from './pdfText';
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
  /** Puts the BetterCalc logo in the page header, as the quantity report does on all its pages. */
  showLogo?: boolean;
}

const AREA_KIND_LABELS: Record<'demolition' | 'construction', string> = {
  demolition: 'הריסה',
  construction: 'בנייה חדשה',
};

const DASH = '—';

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
 * Appends the printable demolition/construction area breakdown to `doc` as vector pages (real text
 * and table lines) — one row per marked area/wall (with the same numbering as the on-canvas wall
 * labels), plus per-kind and grand totals. Shared by both the quantity-takeoff and Revision Compare
 * PDF exports.
 */
export function drawAreaMeasurementTable<T extends WallMeasurementLike>(
  doc: PDFDocument,
  fonts: ReportFonts,
  title: string,
  measurements: T[],
  options: AreaTableOptions = {}
): void {
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

  let pt: PdfPainter;
  let y = 0;

  const drawRow = (cells: string[], bg: string, opts?: { bold?: boolean }) => {
    pt.fillRect(MARGIN, y, usableWidth, ROW_H, bg);
    pt.strokeRect(MARGIN, y, usableWidth, ROW_H, C_BORDER);
    let x = PAGE_W - MARGIN;
    cells.forEach((cell, i) => {
      const w = colWidths[i] ?? 0;
      pt.fillText(cell, x - w / 2, y + ROW_H / 2 + 4, { size: 12, bold: opts?.bold, align: 'center', maxWidth: w - 6 });
      x -= w;
    });
    y += ROW_H;
  };

  const drawColumnHeader = () => {
    pt.fillRect(MARGIN, y, usableWidth, HEADER_ROW_H, C_HEADER);
    let x = PAGE_W - MARGIN;
    headers.forEach((label, i) => {
      const w = colWidths[i];
      pt.fillText(label, x - w / 2, y + HEADER_ROW_H / 2 + 4, { size: 12.5, bold: true, color: '#ffffff', align: 'center', maxWidth: w - 6 });
      x -= w;
    });
    y += HEADER_ROW_H;
  };

  const newPage = () => {
    pt = new PdfPainter(doc.addPage([PAGE_W, PAGE_H]), fonts);
    pt.fillText(`טבלת שטחי הריסה ובנייה — ${title}`, PAGE_W - MARGIN, 40, { size: 20, bold: true, color: '#0f172a' });
    pt.fillText(new Date().toLocaleDateString('he-IL'), PAGE_W - MARGIN, 60, { size: 12, color: '#8b8f99' });
    if (options.showLogo) drawLogo(pt, MARGIN, 28, REPORT_LOGO_HEIGHT);
    y = 84;
    drawColumnHeader();
  };

  const remainingRows = () => Math.floor((PAGE_H - MARGIN - y) / ROW_H);
  const ensureRoom = (rows: number) => {
    if (remainingRows() < rows) newPage();
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
}
