import { PDFDocument } from 'pdf-lib';
import { drawLogo, embedReportFonts, PdfPainter, REPORT_LOGO_HEIGHT, type ReportFonts } from './pdfText';
import { saveAs } from 'file-saver';
import type { Plan, Project } from '../types';
import { t } from '../i18n';
import { buildProjectQuantities, planStatusLabel, roomCategoryQuantity, type CategoryAmount } from './projectQuantities';

/*
 * The project quantity report: vector text and table lines throughout (see lib/pdfText — Hebrew is
 * drawn as real text in an embedded font). Tables only: the marked-up plan images stay in each
 * plan's own report.
 */

const PAGE_W = 1600;
const PAGE_H = 1132;
const MARGIN = 40;
const ROW_H = 30;
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

/** Paginated vector writer: section titles and tables, a new page whenever one fills up. */
class ReportWriter {
  private pt!: PdfPainter;
  private y = 0;
  private doc: PDFDocument;
  private fonts: ReportFonts;
  private title: string;
  private subtitle: string;

  constructor(doc: PDFDocument, fonts: ReportFonts, title: string, subtitle: string) {
    this.doc = doc;
    this.fonts = fonts;
    this.title = title;
    this.subtitle = subtitle;
    this.newPage();
  }

  private newPage() {
    this.pt = new PdfPainter(this.doc.addPage([PAGE_W, PAGE_H]), this.fonts);
    this.pt.fillText(this.title, PAGE_W - MARGIN, 40, { size: 20, bold: true, color: '#0f172a' });
    this.pt.fillText(this.subtitle, PAGE_W - MARGIN, 60, { size: 12, color: '#8b8f99' });
    drawLogo(this.pt, MARGIN, 28, REPORT_LOGO_HEIGHT);
    this.y = 84;
  }

  private ensure(rows: number) {
    if (this.y + rows * ROW_H > PAGE_H - MARGIN) this.newPage();
  }

  private drawCells(cells: string[], widths: number[], bg: string, color: string, bold: boolean) {
    const usable = PAGE_W - MARGIN * 2;
    this.pt.fillRect(MARGIN, this.y, usable, ROW_H, bg);
    this.pt.strokeRect(MARGIN, this.y, usable, ROW_H, C_BORDER);
    let x = PAGE_W - MARGIN;
    cells.forEach((cell, i) => {
      const w = widths[i] ?? 0;
      this.pt.fillText(cell, x - w / 2, this.y + ROW_H / 2 + 4, { size: 12, bold, color, align: 'center', maxWidth: w - 6 });
      x -= w;
    });
    this.y += ROW_H;
  }

  section(title: string) {
    this.ensure(3);
    this.y += 10;
    this.pt.fillText(title, PAGE_W - MARGIN, this.y + 16, { size: 15, bold: true, color: '#0f172a' });
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
    this.pt.fillText(text, PAGE_W - MARGIN, this.y + 16, { size: 12, bold: true, color: '#92400e' });
    this.y += ROW_H;
  }
}

const amountHeaders = () => {
  const m2 = t('units.m2');
  const lm = t('units.lm');
  return [
    t('exports.projectPdf.netUnit', { unit: m2 }),
    t('exports.projectPdf.orderUnit', { unit: m2 }),
    t('exports.projectPdf.netUnit', { unit: lm }),
    t('exports.projectPdf.orderUnit', { unit: lm }),
  ];
};
const amountCells = (a: CategoryAmount) => [fmt(a.quantityM2), fmt(a.orderM2), fmt(a.lengthM), fmt(a.orderLengthM)];

export async function exportProjectToPdf(project: Project, plans: Plan[]) {
  const q = buildProjectQuantities(plans);
  const date = new Date().toLocaleDateString('he-IL');
  const pdfDoc = await PDFDocument.create();
  const fonts = await embedReportFonts(pdfDoc);
  const report = new ReportWriter(
    pdfDoc,
    fonts,
    t('exports.projectPdf.title', { name: project.name }),
    t('exports.projectPdf.subtitle', { count: plans.length, date })
  );
  const AMOUNT_HEADERS = amountHeaders();
  const notCalibrated = t('exports.common.notCalibrated');

  report.section(t('exports.projectPdf.summary'));
  if (q.totals.length === 0) {
    report.note(t('exports.projectPdf.empty'));
  } else {
    report.table([t('exports.common.item'), ...AMOUNT_HEADERS], [18, 12, 12, 12, 12], q.totals.map((total) => ({ cells: [total.label, ...amountCells(total)] })));
  }
  if (q.uncalibratedRoomCount > 0) report.note(t('exports.projectPdf.uncalibratedNote', { count: q.uncalibratedRoomCount }));

  report.section(t('exports.projectPdf.plans'));
  report.table(
    [
      t('exports.common.plan'),
      t('exports.projectPdf.planHeaders.rooms'),
      t('exports.projectPdf.planHeaders.calibratedPages'),
      t('exports.projectPdf.planHeaders.uncalibratedRooms'),
      t('exports.projectPdf.planHeaders.status'),
    ],
    [22, 8, 10, 10, 14],
    q.plans.map((r) => ({
      cells: [r.plan.name, `${r.roomCount}`, `${r.calibratedPageCount}`, `${r.uncalibratedRoomCount}`, planStatusLabel(r.status)],
    }))
  );

  if (q.totals.length > 0) {
    report.section(t('exports.projectPdf.byPlan'));
    report.table(
      [t('exports.common.item'), t('exports.common.plan'), ...AMOUNT_HEADERS],
      [16, 20, 12, 12, 12, 12],
      q.totals.flatMap((total) => [
        { cells: [total.label, t('exports.common.total'), ...amountCells(total)], bg: C_TOTAL, bold: true },
        ...total.perPlan.map((p) => ({ cells: ['', p.planName, ...amountCells(p)] })),
      ])
    );

    report.section(t('exports.projectPdf.byRoom'));
    const categories = q.totals.map((total) => total.category);
    const labels = new Map(q.totals.map((total) => [total.category, total.label]));
    report.table(
      [t('exports.common.plan'), t('exports.common.apartment'), t('exports.common.room'), t('exports.common.item'), ...AMOUNT_HEADERS],
      [16, 7, 16, 12, 10, 10, 10, 10],
      q.plans.flatMap((r) =>
        r.summaries.flatMap((s) =>
          categories.flatMap((c) => {
            const v = roomCategoryQuantity(s, c);
            if (v.wastePercent == null) return [];
            const cells = s.pageCalibrated
              ? [fmt(v.quantityM2), fmt(v.orderM2), fmt(v.lengthM), fmt(v.orderLengthM)]
              : [notCalibrated, notCalibrated, DASH, DASH];
            return [{ cells: [r.plan.name, s.apartmentNumber || DASH, s.roomName, labels.get(c)!, ...cells] }];
          })
        )
      )
    );
  }

  const bytes = await pdfDoc.save();
  const safeName = project.name.replace(/[\\/:*?"<>|]/g, '_');
  saveAs(
    new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: 'application/pdf' }),
    t('exports.projectPdf.fileName', { name: safeName })
  );
}
