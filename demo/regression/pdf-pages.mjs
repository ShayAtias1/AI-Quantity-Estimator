// Renders the pages of a PDF to PNGs (for looking at an export) and prints each page's text, using the
// app's own pdf.js in a headless Chromium — no extra tooling.
//
// Run: node demo/regression/pdf-pages.mjs <file.pdf> <outDir> [scale]
//   → <outDir>/<name>-<page>.png  and  <outDir>/<name>.txt (the page texts, one block per page)
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const [pdfPath, outDir, scaleArg] = process.argv.slice(2);
if (!pdfPath || !outDir) {
  console.error('usage: node demo/regression/pdf-pages.mjs <file.pdf> <outDir> [scale]');
  process.exit(1);
}
const scale = Number(scaleArg) || 0.9;
const name = path.basename(pdfPath, '.pdf');

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/') {
      res.setHeader('content-type', 'text/html');
      res.end('<!doctype html><canvas id="c"></canvas>');
    } else if (req.url === '/doc.pdf') {
      res.setHeader('content-type', 'application/pdf');
      res.end(await readFile(pdfPath));
    } else if (req.url.startsWith('/pdfjs/')) {
      res.setHeader('content-type', 'text/javascript');
      res.end(await readFile(path.join(ROOT, 'node_modules', 'pdfjs-dist', 'build', req.url.slice('/pdfjs/'.length))));
    } else res.statusCode = 404, res.end();
  } catch (e) {
    res.statusCode = 500;
    res.end(String(e));
  }
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 1400 } });
await page.goto(base);
await mkdir(outDir, { recursive: true });
const pages = await page.evaluate(
  async ({ base, scale }) => {
    const pdfjs = await import(`${base}/pdfjs/pdf.mjs`);
    pdfjs.GlobalWorkerOptions.workerSrc = `${base}/pdfjs/pdf.worker.mjs`;
    const doc = await pdfjs.getDocument({ url: `${base}/doc.pdf` }).promise;
    const out = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const p = await doc.getPage(i);
      const vp = p.getViewport({ scale });
      const c = document.getElementById('c');
      c.width = vp.width;
      c.height = vp.height;
      await p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      const text = (await p.getTextContent()).items.map((t) => t.str).filter((s) => s.trim());
      out.push({ png: c.toDataURL('image/png').split(',')[1], text, width: vp.width / scale, height: vp.height / scale });
    }
    return out;
  },
  { base, scale }
);
let txt = '';
for (const [i, p] of pages.entries()) {
  await writeFile(path.join(outDir, `${name}-${i + 1}.png`), Buffer.from(p.png, 'base64'));
  txt += `--- page ${i + 1} (${Math.round(p.width)}x${Math.round(p.height)}) ---\n${p.text.join('\n')}\n`;
}
await writeFile(path.join(outDir, `${name}.txt`), txt);
console.log(`${pages.length} page(s) → ${outDir}`);
await browser.close();
server.close();
