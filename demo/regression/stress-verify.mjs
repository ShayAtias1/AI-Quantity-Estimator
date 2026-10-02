// Excel + user-content checks for the hardening run (stress.mjs captures): the English workbooks hold the same
// numbers and formulas as the Hebrew ones, English sheet names (valid Excel names), and every user-written
// name/note survives byte-for-byte.   node demo/regression/stress-verify.mjs <hebrewLabel> <englishLabel>
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { STRESS_PLAN_1, STRESS_PLAN_2, STRESS_PROJECT } from './stress-fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const [heLabel, enLabel] = process.argv.slice(2);
const dir = (l) => path.join(ROOT, 'demo', 'output', 'regression', l);
let failures = 0;
const check = (ok, what, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? ` — ${detail}` : ''}`);
};
const load = async (file) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  return wb.worksheets.map((s) => {
    const cells = {};
    s.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => (cells[c.address] = c.value)));
    return { name: s.name, rtl: s.views[0]?.rightToLeft === true, cells, widths: s.columns.map((c) => c.width), rows: s.rowCount };
  });
};
const isFormula = (v) => v && typeof v === 'object' && 'formula' in v;
const userStrings = [
  STRESS_PROJECT.name,
  STRESS_PLAN_1.name,
  STRESS_PLAN_2.name,
  ...[STRESS_PLAN_1, STRESS_PLAN_2].flatMap((p) => p.rooms.flatMap((r) => [r.name, r.apartmentNumber, r.notes].filter(Boolean))),
];
for (const file of ['plan.xlsx', 'project.xlsx']) {
  const he = await load(path.join(dir(heLabel), file));
  const en = await load(path.join(dir(enLabel), file));
  check(he.length === en.length && he.every((s, i) => s.rows === en[i].rows), `${file}: same sheets and row counts`, `${en.length} sheets, ${en.map((s) => s.rows).join('/')} rows`);
  check(en.every((s) => !s.rtl) && he.every((s) => s.rtl), `${file}: English LTR, Hebrew RTL`);
  check(en.every((s) => s.name.length <= 31 && !/[\\/?*[\]:]/.test(s.name)), `${file}: valid sheet names`, en.map((s) => s.name).join(' | '));
  const norm = (f, names) => names.reduce((acc, n, i) => acc.split(`'${n}'!`).join(`#${i}!`), f);
  let formulas = 0, numbers = 0, bad = 0;
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
  check(bad === 0 && numbers > 0, `${file}: numbers and formulas identical to Hebrew`, `${numbers} numbers, ${formulas} formulas, ${bad} differences`);
  // every formula that crosses sheets points at a sheet that exists
  const sheetNames = new Set(en.map((s) => s.name));
  const refs = en.flatMap((s) => Object.values(s.cells).filter(isFormula).flatMap((v) => [...v.formula.matchAll(/'((?:[^']|'')+)'!/g)].map((m) => m[1].replace(/''/g, "'"))));
  check(refs.every((n) => sheetNames.has(n)), `${file}: every cross-sheet reference resolves`, `${refs.length} references`);
  const text = new Set(en.flatMap((s) => Object.values(s.cells).filter((v) => typeof v === 'string')));
  const htext = new Set(he.flatMap((s) => Object.values(s.cells).filter((v) => typeof v === 'string')));
  const rooms = userStrings.filter((s) => s.length > 2 && !/^\d+$/.test(s));
  const present = (set) => rooms.filter((s) => [...set].some((c) => c.includes(s)));
  check(present(text).length === present(htext).length && present(text).length > 0, `${file}: user names/notes present and untranslated, same set as Hebrew`, `${present(text).length} of ${rooms.length} distinct strings appear`);
  // widths: long user content is wrapped/limited, never an absurd column
  const widest = Math.max(...en.flatMap((s) => s.widths.filter(Boolean)));
  check(widest <= 80, `${file}: no runaway column width`, `widest ${widest}`);
}
console.log(failures ? `${failures} FAILED` : 'all stress Excel checks passed');
process.exit(failures ? 1 : 0);
