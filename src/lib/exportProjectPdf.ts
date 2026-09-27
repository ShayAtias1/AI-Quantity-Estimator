import { PDFDocument } from 'pdf-lib';
import { saveAs } from 'file-saver';
import type { Plan, Project } from '../types';
import { AREA_UNIT, PANEL_LENGTH_UNIT } from '../types';
import { buildProjectQuantities, PLAN_STATUS_LABELS, roomCategoryQuantity, type CategoryAmount } from './projectQuantities';

/*
 * The project quantity report. Like every BetterCalc PDF, pages are drawn on a canvas and embedded
 * as images — pdf-lib's standard fonts cannot encode Hebrew. Tables only: the marked-up plan images
 * stay in each plan's own report.
 */

const PAGE_W = 1600;
const PAGE_H = 1132;
const MARGIN = 40;
const ROW_H = 30;
const FONT = "'Segoe UI', sans-serif";
const DASH = '—';

// Same palette as the other exports.
const C_HEADER = '#1F4E79';
const C_ZEBRA_A = '#EBF5FB';
const C_ZEBRA_B = '#FDFEFE';
const C_TOTAL = '#D6E4F0';
const C_BORDER = '#E2E8F0';

interface TableRow {
  cells: string[];
  bg?: string;
  bold?: boolean;
}

const fmt = (v: number | null | undefined) => (v == null ? DASH : v.toLocaleString('he-IL', { maximumFractionDigits: 2 }));

/** Paginated canvas writer: section titles and tables, a new page whenever one fills up. */
class ReportCanvas {
  pages: HTMLCanvasElement[] = [];
  private ctx!: CanvasRenderingContext2D;
  private y = 0;
  private title: string;
  private subtitle: string;

  constructor(title: string, subtitle: string) {
    this.title = title;
    this.subtitle = subtitle;
    this.newPage();
  }

  private newPage() {
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    this.ctx = ctx;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0f172a';
    ctx.font = `bold 20px ${FONT}`;
    ctx.fillText(this.title, PAGE_W - MARGIN, 40);
    ctx.fillStyle = '#8b8f99';
    ctx.font = `12px ${FONT}`;
    ctx.fillText(this.subtitle, PAGE_W - MARGIN, 60);
    this.y = 84;
    this.pages.push(canvas);
  }

  private ensure(rows: number) {
    if (this.y + rows * ROW_H > PAGE_H - MARGIN) this.newPage();
  }

  private drawCells(cells: string[], widths: number[], bg: string, color: string, bold: boolean) {
    const ctx = this.ctx;
    const usable = PAGE_W - MARGIN * 2;
    ctx.fillStyle = bg;
    ctx.fillRect(MARGIN, this.y, usable, ROW_H);
    ctx.strokeStyle = C_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(MARGIN, this.y, usable, ROW_H);
    ctx.fillStyle = color;
    ctx.font = `${bold ? 'bold ' : ''}12px ${FONT}`;
    ctx.textAlign = 'center';
    let x = PAGE_W - MARGIN;
    cells.forEach((cell, i) => {
      const w = widths[i] ?? 0;
      ctx.fillText(cell, x - w / 2, this.y + ROW_H / 2 + 4, w - 6);
      x -= w;
    });
    this.y += ROW_H;
  }

  section(title: string) {
    this.ensure(3);
    this.y += 10;
    this.ctx.fillStyle = '#0f172a';
    this.ctx.font = `bold 15px ${FONT}`;
    this.ctx.textAlign = 'right';
    this.ctx.fillText(title, PAGE_W - MARGIN, this.y + 16);
    this.y += 26;
  }

  table(headers: string[], weights: number[], rows: TableRow[]) {
    const usable = PAGE_W - MARGIN * 2;
    const total = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (usable * w) / total);
    const header = () => this.drawCells(headers, widths, C_HEADER, '#ffffff', true);
    this.ensure(2);
    header();
    rows.forEach((row, i) => {
      if (this.y + ROW_H > PAGE_H - MARGIN) {
        this.newPage();
        header(); // repeat the header on every page the table continues onto
      }
      this.drawCells(row.cells, widths, row.bg ?? (i % 2 === 0 ? C_ZEBRA_A : C_ZEBRA_B), '#1e293b', !!row.bold);
    });
    this.y += ROW_H * 0.5;
  }

  note(text: string) {
    this.ensure(1);
    this.ctx.fillStyle = '#92400e';
    this.ctx.font = `bold 12px ${FONT}`;
    this.ctx.textAlign = 'right';
    this.ctx.fillText(text, PAGE_W - MARGIN, this.y + 16);
    this.y += ROW_H;
  }
}

const AMOUNT_HEADERS = [`נטו (${AREA_UNIT})`, `להזמנה (${AREA_UNIT})`, `נטו (${PANEL_LENGTH_UNIT})`, `להזמנה (${PANEL_LENGTH_UNIT})`];
const amountCells = (a: CategoryAmount) => [fmt(a.quantityM2), fmt(a.orderM2), fmt(a.lengthM), fmt(a.orderLengthM)];

export async function exportProjectToPdf(project: Project, plans: Plan[]) {
  const q = buildProjectQuantities(plans);
  const date = new Date().toLocaleDateString('he-IL');
  const report = new ReportCanvas(`כתב כמויות לפרויקט — ${project.name}`, `${plans.length} תוכניות · ${date}`);

  report.section('סיכום כמויות');
  if (q.totals.length === 0) {
    report.note('אין עדיין כמויות בפרויקט — סמן חדרים והוסף להם סוגי עבודה.');
  } else {
    report.table(['פריט', ...AMOUNT_HEADERS], [18, 12, 12, 12, 12], q.totals.map((t) => ({ cells: [t.label, ...amountCells(t)] })));
  }
  if (q.uncalibratedRoomCount > 0) report.note(`שים לב: ${q.uncalibratedRoomCount} חדרים לא נכללו — העמוד שלהם אינו מכויל.`);

  report.section('תוכניות');
  report.table(
    ['תוכנית', 'חדרים', 'עמודים מכוילים', 'חדרים ללא כיול', 'סטטוס כמויות'],
    [22, 8, 10, 10, 14],
    q.plans.map((r) => ({
      cells: [r.plan.name, `${r.roomCount}`, `${r.calibratedPageCount}`, `${r.uncalibratedRoomCount}`, PLAN_STATUS_LABELS[r.status]],
    }))
  );

  if (q.totals.length > 0) {
    report.section('פירוט לפי תוכנית');
    report.table(
      ['פריט', 'תוכנית', ...AMOUNT_HEADERS],
      [16, 20, 12, 12, 12, 12],
      q.totals.flatMap((t) => [
        { cells: [t.label, 'סה"כ', ...amountCells(t)], bg: C_TOTAL, bold: true },
        ...t.perPlan.map((p) => ({ cells: ['', p.planName, ...amountCells(p)] })),
      ])
    );

    report.section('פירוט חדרים');
    const categories = q.totals.map((t) => t.category);
    const labels = new Map(q.totals.map((t) => [t.category, t.label]));
    report.table(
      ['תוכנית', 'דירה', 'חדר', 'פריט', ...AMOUNT_HEADERS],
      [16, 7, 16, 12, 10, 10, 10, 10],
      q.plans.flatMap((r) =>
        r.summaries.flatMap((s) =>
          categories.flatMap((c) => {
            const v = roomCategoryQuantity(s, c);
            if (v.wastePercent == null) return [];
            const cells = s.pageCalibrated
              ? [fmt(v.quantityM2), fmt(v.orderM2), fmt(v.lengthM), fmt(v.orderLengthM)]
              : ['לא כויל', 'לא כויל', DASH, DASH];
            return [{ cells: [r.plan.name, s.apartmentNumber || DASH, s.roomName, labels.get(c)!, ...cells] }];
          })
        )
      )
    );
  }

  const pdfDoc = await PDFDocument.create();
  for (const canvas of report.pages) {
    const png = await pdfDoc.embedPng(await fetch(canvas.toDataURL('image/png')).then((r) => r.arrayBuffer()));
    pdfDoc.addPage([PAGE_W, PAGE_H]).drawImage(png, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
  }
  const bytes = await pdfDoc.save();
  const safeName = project.name.replace(/[\\/:*?"<>|]/g, '_');
  saveAs(
    new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: 'application/pdf' }),
    `דוח-כמויות-פרויקט-${safeName}.pdf`
  );
}
