import { PDFDocument } from 'pdf-lib';
import { saveAs } from 'file-saver';
import type { Measurement } from '../types/compare';
import { buildAreaMeasurementTablePages } from './areaMeasurementTable';

/**
 * Wrap an already-rendered composite raster (PNG data URL, produced by the canvas viewer —
 * all text/labels are rasterized there so this stays free of PDF font/encoding concerns,
 * notably Hebrew, which pdf-lib's standard fonts cannot encode) into a downloadable PDF, followed by
 * an organized demolition/construction area breakdown table (one row per marked area/wall, plus totals).
 */
export async function exportCompositeAsPdf(
  pngDataUrl: string,
  widthPx: number,
  heightPx: number,
  fileBaseName: string,
  areaMeasurements: Measurement[] = []
) {
  const pdfDoc = await PDFDocument.create();
  const pngBytes = await fetch(pngDataUrl).then((r) => r.arrayBuffer());
  const pngImage = await pdfDoc.embedPng(pngBytes);

  // Treat raster pixels as PDF points 1:1 so the exported page matches the plan's native scale.
  const page = pdfDoc.addPage([widthPx, heightPx]);
  page.drawImage(pngImage, { x: 0, y: 0, width: widthPx, height: heightPx });

  if (areaMeasurements.length > 0) {
    const tablePages = buildAreaMeasurementTablePages(fileBaseName, areaMeasurements);
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
