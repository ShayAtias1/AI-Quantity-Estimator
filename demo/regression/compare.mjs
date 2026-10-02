// Compares two regression captures (demo/regression/capture.mjs) and reports every difference.
//
// - Screenshots: decoded in Chromium and compared pixel by pixel.
// - Excel: every sheet, view, column width and cell (value / formula / cached result / number format).
// - PDF: page sizes and every content stream, decompressed, with pdf-lib's random resource names
//   normalised; embedded images and fonts compared by content.
// - Overlay text boxes (results.json): compared exactly, and each capture's RTL vs forced-LTR boxes
//   are reported — a saved text note must not move when the page direction changes.
//
// Run: node demo/regression/compare.mjs <labelA> <labelB>
import path from 'node:path';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { PDFDocument, PDFRawStream, PDFName } from 'pdf-lib';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = path.resolve(__dirname, '..', 'output', 'regression');
const [a, b] = process.argv.slice(2);
if (!a || !b) {
  console.error('usage: node demo/regression/compare.mjs <labelA> <labelB>');
  process.exit(1);
}
const dirA = path.join(BASE, a);
const dirB = path.join(BASE, b);
let failures = 0;
const report = (ok, what, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'same ' : 'DIFF '} ${what}${detail ? ` — ${detail}` : ''}`);
};

async function excelDump(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  return wb.worksheets.map((s) => {
    const cells = {};
    s.eachRow((row) => row.eachCell((c) => (cells[c.address] = { v: c.value, f: c.numFmt ?? null })));
    return { name: s.name, views: s.views, widths: s.columns?.map((c) => c.width ?? null), cells };
  });
}

async function pdfDump(file) {
  const doc = await PDFDocument.load(await readFile(file), { updateMetadata: false });
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  // pdf-lib names resources with random suffixes (e.g. "F-1234567890"); only their order matters.
  const normalise = (text) => text.replace(/\b([A-Za-z]+)-\d{6,}(-\d+)?\b/g, '$1-#');
  const pages = doc.getPages().map((p) => {
    const contents = p.node.Contents();
    const streams = contents ? ('asArray' in contents ? contents.asArray() : [contents]) : [];
    const text = streams
      .map((ref) => doc.context.lookup(ref))
      .map((s) => (s instanceof PDFRawStream ? Buffer.from(s.getContents()) : Buffer.alloc(0)))
      .map((buf) => {
        try {
          return inflateSync(buf).toString('latin1');
        } catch {
          return buf.toString('latin1');
        }
      })
      .join('\n');
    return { size: p.getSize(), content: normalise(text) };
  });
  // Every image / font-file stream in the file, by content (order-independent).
  const blobs = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const subtype = obj.dict.get(PDFName.of('Subtype'))?.toString();
    if (subtype === '/Image' || obj.dict.has(PDFName.of('Length1')) || subtype === '/OpenType' || subtype === '/CIDFontType0C') {
      blobs.push(`${subtype ?? 'font'}:${hash(obj.getContents())}`);
    }
  }
  return { pages, blobs: blobs.sort() };
}

function firstDifference(x, y) {
  const lx = x.split('\n');
  const ly = y.split('\n');
  for (let i = 0; i < Math.max(lx.length, ly.length); i++) if (lx[i] !== ly[i]) return `line ${i + 1}: ${JSON.stringify(lx[i]?.slice(0, 120))} vs ${JSON.stringify(ly[i]?.slice(0, 120))}`;
  return '';
}

async function comparePngs(browser, name) {
  const [ba, bb] = await Promise.all([readFile(path.join(dirA, name)), readFile(path.join(dirB, name))]);
  if (ba.equals(bb)) return report(true, name, 'identical bytes');
  const page = await browser.newPage();
  const result = await page.evaluate(
    async ([x, y]) => {
      const load = async (b64) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, c.width, c.height);
      };
      const [p, q] = await Promise.all([load(x), load(y)]);
      if (p.width !== q.width || p.height !== q.height) return { sizeMismatch: true };
      let diff = 0;
      for (let i = 0; i < p.data.length; i += 4)
        if (p.data[i] !== q.data[i] || p.data[i + 1] !== q.data[i + 1] || p.data[i + 2] !== q.data[i + 2]) diff++;
      return { diff, total: p.width * p.height };
    },
    [ba.toString('base64'), bb.toString('base64')]
  );
  await page.close();
  if (result.sizeMismatch) return report(false, name, 'different size');
  report(result.diff === 0, name, `${result.diff} of ${result.total} pixels differ`);
}

function boxesMoved(rtl, ltr) {
  const moved = rtl.filter((r, i) => {
    const l = ltr[i];
    return !l || Math.abs(r.x - l.x) > 0.5 || Math.abs(r.y - l.y) > 0.5;
  });
  return moved.map((r) => r.text);
}

async function main() {
  const browser = await chromium.launch();
  try {
    for (const png of ['plan-rtl.png', 'compare-rtl.png']) await comparePngs(browser, png);
  } finally {
    await browser.close();
  }

  for (const xlsx of ['plan.xlsx', 'project.xlsx']) {
    const [x, y] = await Promise.all([excelDump(path.join(dirA, xlsx)), excelDump(path.join(dirB, xlsx))]);
    const sx = JSON.stringify(x, null, 1);
    const sy = JSON.stringify(y, null, 1);
    report(sx === sy, xlsx, sx === sy ? `${x.map((s) => s.name).join(', ')}` : firstDifference(sx, sy));
  }

  for (const pdf of ['plan.pdf', 'plan-page.pdf', 'project.pdf', 'compare.pdf']) {
    const [x, y] = await Promise.all([pdfDump(path.join(dirA, pdf)), pdfDump(path.join(dirB, pdf))]);
    const sameSizes = JSON.stringify(x.pages.map((p) => p.size)) === JSON.stringify(y.pages.map((p) => p.size));
    const contentDiffs = x.pages.map((p, i) => (p.content === y.pages[i]?.content ? '' : `page ${i + 1} ${firstDifference(p.content, y.pages[i]?.content ?? '')}`)).filter(Boolean);
    const sameBlobs = JSON.stringify(x.blobs) === JSON.stringify(y.blobs);
    report(
      sameSizes && contentDiffs.length === 0 && sameBlobs,
      pdf,
      `${x.pages.length} pages; content ${contentDiffs.length ? contentDiffs.join('; ') : 'identical'}; images/fonts ${sameBlobs ? 'identical' : 'DIFFER'}`
    );
  }

  const [ra, rb] = await Promise.all([readFile(path.join(dirA, 'results.json'), 'utf8'), readFile(path.join(dirB, 'results.json'), 'utf8')].map(async (p) => JSON.parse(await p)));
  for (const key of ['plan-rtl', 'compare-rtl']) {
    const same = JSON.stringify(ra[key]) === JSON.stringify(rb[key]);
    report(same, `overlay text boxes ${key}`, same ? `${ra[key].length} texts` : firstDifference(JSON.stringify(ra[key], null, 1), JSON.stringify(rb[key], null, 1)));
  }
  for (const [label, r] of [[a, ra], [b, rb]]) {
    for (const viewer of ['plan', 'compare']) {
      const moved = boxesMoved(r[`${viewer}-rtl`], r[`${viewer}-ltr`]);
      console.log(`info  ${label}: ${viewer} texts that move when the page is forced to LTR: ${moved.length ? moved.map((t) => JSON.stringify(t)).join(', ') : 'none'}`);
    }
    console.log(`info  ${label}: page errors: ${r.errors.length ? r.errors.join(' | ') : 'none'}`);
  }

  console.log(failures ? `\n${failures} difference(s)` : '\nno differences');
  process.exitCode = failures ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
