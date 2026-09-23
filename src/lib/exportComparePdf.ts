import { PDFDocument } from 'pdf-lib';
import { saveAs } from 'file-saver';
import type { Measurement } from '../types/compare';
import { buildAreaMeasurementTablePages } from './areaMeasurementTable';

/**
 * One demolition/new-construction table to append after the plan pages. Each carries its own
 * revision's rows and that revision's numbering, so a multi-revision export never attributes one
 * revision's quantities to another.
 */
export interface ChangeTable {
  title: string;
  measurements: Measurement[];
  /** Numbering built from the revision's whole measurement list — see `changeNumbering`. */
  numbering?: Map<string, number>;
}

/** One composite raster per revision (or page), each becoming its own PDF page, in the order given. */
export interface CompositeImage {
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Wrap the already-rendered composite rasters (PNG data URLs produced by the canvas viewer — all
 * text and labels are rasterized there, so this stays free of PDF font/encoding concerns, notably
 * Hebrew, which pdf-lib's standard fonts cannot encode) into one downloadable PDF, followed by the
 * demolition/new-construction tables that belong to them.
 *
 * One composite per exported source-page/revision pair, in the order the export walked them, with
 * `changeTables` carrying the matching table for each pair.
 */
export async function exportCompositesAsPdf(
  composites: CompositeImage[],
  fileBaseName: string,
  changeTables: ChangeTable[] = []
) {
  if (composites.length === 0) return;
  const pdfDoc = await PDFDocument.create();

  for (const composite of composites) {
    const pngBytes = await fetch(composite.dataUrl).then((r) => r.arrayBuffer());
    const pngImage = await pdfDoc.embedPng(pngBytes);
    // Treat raster pixels as PDF points 1:1 so the exported page matches the plan's native scale.
    const page = pdfDoc.addPage([composite.width, composite.height]);
    page.drawImage(pngImage, { x: 0, y: 0, width: composite.width, height: composite.height });
  }

  // One table per revision, in the same order as the rasters above, each titled with the revision
  // it belongs to.
  for (const table of changeTables) {
    if (table.measurements.length === 0) continue;
    const tablePages = buildAreaMeasurementTablePages(table.title, table.measurements, {
      numbering: table.numbering,
      showPage: true,
    });
    for (const tp of tablePages) {
      const bytes = await fetch(tp.dataUrl).then((r) => r.arrayBuffer());
      const img = await pdfDoc.embedPng(bytes);
      const tablePage = pdfDoc.addPage([tp.width, tp.height]);
      tablePage.drawImage(img, { x: 0, y: 0, width: tp.width, height: tp.height });
    }
  }

  const bytes = await pdfDoc.save();
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
    type: 'application/pdf',
  });
  const safeName = fileBaseName.replace(/[\\/:*?"<>|]/g, '_');
  saveAs(blob, `השוואה-${safeName}.pdf`);
}
