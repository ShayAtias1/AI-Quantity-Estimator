// Checks the English exports of a capture against the Hebrew ones (both from demo/regression/capture.mjs):
//   node demo/regression/verify-exports.mjs <hebrewLabel> <englishLabel>
//
// - xlsx: same cells, same numbers, same formulas (sheet names aside), English sheet names, LTR sheets
// - PDF: same page counts; the text BetterCalc wrote is English (Hebrew only where it is the demo
//   data's own); key English headings are present
// - the imported plan alone (plan-bare.pdf, overlays hidden) is pixel-identical in both languages
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { PDFDocument, PDFRawStream, PDFName } from 'pdf-lib';
import { LEGACY_COMPARISON, LEGACY_PLAN } from './fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const [heLabel, enLabel] = process.argv.slice(2);
if (!heLabel || !enLabel) {
  console.error('usage: node demo/regression/verify-exports.mjs <hebrewLabel> <englishLabel>');
  process.exit(1);
}
const dir = (l) => path.join(ROOT, 'demo', 'output', 'regression', l);
let failures = 0;
const check = (ok, what, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? ` — ${detail}` : ''}`);
};

const HEBREW = /[֐-׿]+/g;
const DEMO = new Set([...(JSON.stringify([LEGACY_PLAN, LEGACY_COMPARISON]).match(HEBREW) ?? []), 'מעודכן']);
const demoText = [...DEMO].join('');
const interfaceHebrew = (strings) => strings.filter((s) => (s.match(HEBREW) ?? []).some((w) => !DEMO.has(w) && !demoText.includes(w)));

// ---------- Excel ----------
async function sheets(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  return wb.worksheets.map((s) => {
    const cells = {};
    s.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => (cells[c.address] = c.value)));
    return { name: s.name, rtl: s.views[0]?.rightToLeft === true, cells };
  });
}
const isFormula = (v) => v && typeof v === 'object' && 'formula' in v;
for (const file of ['plan.xlsx', 'project.xlsx']) {
  const he = await sheets(path.join(dir(heLabel), file));
  const en = await sheets(path.join(dir(enLabel), file));
  check(he.length === en.length, `${file}: same sheet count`, `${he.length}`);
  check(en.every((s) => !s.rtl) && he.every((s) => s.rtl), `${file}: English LTR, Hebrew RTL`);
  check(en.every((s) => !HEBREW.test(s.name)), `${file}: English sheet names`, en.map((s) => s.name).join(' | '));
  let formulas = 0, numbers = 0, bad = 0;
  const norm = (f, names) => names.reduce((acc, n, i) => acc.split(`'${n}'!`).join(`#${i}!`), f);
  en.forEach((s, i) => {
    for (const [addr, v] of Object.entries(s.cells)) {
      const h = he[i].cells[addr];
      if (isFormula(v)) {
        formulas++;
        if (!isFormula(h) || norm(v.formula, en.map((x) => x.name)) !== norm(h.formula, he.map((x) => x.name)) || JSON.stringify(v.result) !== JSON.stringify(h.result)) bad++;
      } else if (typeof h === 'number') {
        numbers++;
        if (v !== h) bad++;
      }
    }
  });
  check(bad === 0 && formulas > 0 && numbers > 0, `${file}: numbers and formulas identical to Hebrew`, `${numbers} numbers, ${formulas} formulas, ${bad} differences`);
  const heb = en.flatMap((s) => Object.values(s.cells).filter((v) => typeof v === 'string'));
  const stray = interfaceHebrew(heb);
  check(stray.length === 0, `${file}: no Hebrew except the project's own text`, stray.slice(0, 3).join(' | '));
}

// ---------- PDF ----------
const textOf = (label, file) => {
  const out = path.join(ROOT, 'demo', 'output', 'verify', label);
  execFileSync('node', [path.join(ROOT, 'demo/regression/pdf-pages.mjs'), path.join(dir(label), file), out, '0.4'], { stdio: 'pipe' });
  return readFile(path.join(out, `${path.basename(file, '.pdf')}.txt`), 'utf8');
};
const expectEn = {
  'plan.pdf': ['Quantity Takeoff', 'Apartment', 'Room', 'Standard Floor Tiling', 'Skirting', 'Net', 'To order', 'Openings', 'Project grand total'],
  'plan-page.pdf': [],
  'project.pdf': ['Project Quantity Takeoff', 'Quantity Summary', 'Breakdown by Plan', 'Room Breakdown', 'Wall Cladding'],
  'compare.pdf': ['Demolition & New Construction Areas', 'Demolition', 'New Construction', 'Grand total'],
};
for (const [file, phrases] of Object.entries(expectEn)) {
  const he = await textOf(heLabel, file);
  const en = await textOf(enLabel, file);
  const pages = (t) => (t.match(/--- page/g) ?? []).length;
  check(pages(he) === pages(en), `${file}: same page count`, `${pages(en)}`);
  const lines = en.split('\n').filter((l) => l && !l.startsWith('--- page'));
  const stray = interfaceHebrew(lines);
  check(stray.length === 0, `${file}: no Hebrew except the project's own text`, stray.slice(0, 3).join(' | '));
  for (const p of phrases) check(en.includes(p), `${file}: has "${p}"`);
}

// ---------- the imported plan itself ----------
async function imageHashes(file) {
  const doc = await PDFDocument.load(await readFile(file));
  const out = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Subtype'))?.toString() === '/Image') {
      let data = obj.contents;
      try { data = inflateSync(data); } catch {}
      out.push(createHash('sha1').update(data).digest('hex'));
    }
  }
  return out;
}
{
  const he = await imageHashes(path.join(dir(heLabel), 'plan-bare.pdf'));
  const en = await imageHashes(path.join(dir(enLabel), 'plan-bare.pdf'));
  check(he.length > 0 && JSON.stringify(he) === JSON.stringify(en), 'plan-bare.pdf: the imported plan raster is identical in Hebrew and English', `${he.length} image(s)`);
}
console.log(failures ? `${failures} check(s) FAILED` : 'all export checks passed');
process.exitCode = failures ? 1 : 0;
