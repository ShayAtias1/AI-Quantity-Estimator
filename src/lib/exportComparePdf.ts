import { PDFDocument } from 'pdf-lib';
import { saveAs } from 'file-saver';

/**
 * Wrap an already-rendered composite raster (PNG data URL, produced by the canvas viewer —
 * all text/labels are rasterized there so this stays free of PDF font/encoding concerns,
 * notably Hebrew, which pdf-lib's standard fonts cannot encode) into a downloadable PDF.
 */
export async function exportCompositeAsPdf(pngDataUrl: string, widthPx: number, heightPx: number, fileBaseName: string) {
  const pdfDoc = await PDFDocument.create();
  const pngBytes = await fetch(pngDataUrl).then((r) => r.arrayBuffer());
  const pngImage = await pdfDoc.embedPng(pngBytes);

  // Treat raster pixels as PDF points 1:1 so the exported page matches the plan's native scale.
  const page = pdfDoc.addPage([widthPx, heightPx]);
  page.drawImage(pngImage, { x: 0, y: 0, width: widthPx, height: heightPx });

  const bytes = await pdfDoc.save();
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
    type: 'application/pdf',
  });
  const safeName = fileBaseName.replace(/[\\/:*?"<>|]/g, '_');
  saveAs(blob, `השוואה-${safeName}.pdf`);
}
