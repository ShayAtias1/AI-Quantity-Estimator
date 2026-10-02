// Layout checks on a PDF's vector text, with the app's own pdf.js: per page, text running off the page,
// text boxes overlapping each other, and the narrowest horizontal condensing (PdfPainter squeezes text
// that would not fit its cell, so a tiny ratio is what "clipping" looks like in these reports).
//   node demo/regression/pdf-layout-check.mjs <file.pdf>
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pdfPath = process.argv[2];
const server = http.createServer(async (req, res) => {
  if (req.url === '/') return res.setHeader('content-type', 'text/html'), res.end('<!doctype html>');
  if (req.url === '/doc.pdf') return res.setHeader('content-type', 'application/pdf'), res.end(await readFile(pdfPath));
  if (req.url.startsWith('/pdfjs/')) return res.setHeader('content-type', 'text/javascript'), res.end(await readFile(path.join(ROOT, 'node_modules', 'pdfjs-dist', 'build', req.url.slice(7))));
  res.statusCode = 404, res.end();
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(base);
const report = await page.evaluate(async (base) => {
  const pdfjs = await import(`${base}/pdfjs/pdf.mjs`);
  pdfjs.GlobalWorkerOptions.workerSrc = `${base}/pdfjs/pdf.worker.mjs`;
  const doc = await pdfjs.getDocument({ url: `${base}/doc.pdf` }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const [, , W, H] = p.view;
    const items = (await p.getTextContent()).items
      .filter((t) => t.str.trim())
      .map((t) => ({ s: t.str, x: t.transform[4], y: t.transform[5], w: t.width, h: Math.abs(t.transform[3]) || t.height, k: Math.abs(t.transform[0]) / (Math.abs(t.transform[3]) || 1) }));
    const off = items.filter((t) => t.x < -0.5 || t.x + t.w > W + 0.5 || t.y < 0 || t.y > H);
    const overlaps = [];
    for (let a = 0; a < items.length; a++)
      for (let b = a + 1; b < items.length; b++) {
        const A = items[a], B = items[b];
        const ix = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
        const iy = Math.min(A.y + A.h * 0.7, B.y + B.h * 0.7) - Math.max(A.y, B.y);
        if (ix > 1.5 && iy > 1.5 && (A.x !== B.x || A.y !== B.y)) overlaps.push([A.s, B.s]);
      }
    const squeezed = items.filter((t) => t.k < 0.8).map((t) => `${t.s} (${t.k.toFixed(2)})`);
    pages.push({ n: i, items: items.length, off: off.map((t) => `${t.s.slice(0, 60)}@${Math.round(t.x)},${Math.round(t.y)}+${Math.round(t.w)} of ${Math.round(W)}x${Math.round(H)}`), overlaps: overlaps.slice(0, 5), overlapCount: overlaps.length, squeezed, minK: Math.min(1, ...items.map((t) => t.k)) });
  }
  return pages;
}, base);
for (const p of report) console.log(`p${p.n}: ${p.items} text items, off-page ${p.off.length}${p.off.length ? ` [${p.off[0]}]` : ''}, overlaps ${p.overlapCount}, narrowest condense ${p.minK.toFixed(2)}${p.squeezed.length ? `, squeezed<0.8: ${p.squeezed.slice(0, 4).join(' | ')}` : ''}${p.overlapCount ? ` e.g. ${JSON.stringify(p.overlaps[0])}` : ''}`);
console.log(`${report.length} page(s); off-page ${report.reduce((s, p) => s + p.off.length, 0)}, overlaps ${report.reduce((s, p) => s + p.overlapCount, 0)}`);
await browser.close();
server.close();
