// Renders a workbook's sheets as HTML tables (column widths, fills, bold, centring, RTL view flag) and
// screenshots them — an approximation of how Excel shows the file, enough to spot clipped headers.
//
// Run: node demo/regression/xlsx-preview.mjs <file.xlsx> <outDir>
import ExcelJS from 'exceljs';
import { chromium } from 'playwright';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

const [file, outDir] = process.argv.slice(2);
if (!file || !outDir) {
  console.error('usage: node demo/regression/xlsx-preview.mjs <file.xlsx> <outDir>');
  process.exit(1);
}
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const name = path.basename(file, '.xlsx');
let i = 0;
for (const sheet of wb.worksheets) {
  const rtl = sheet.views[0]?.rightToLeft === true;
  const cols = sheet.columnCount;
  const widths = Array.from({ length: cols }, (_, c) => Math.round((sheet.getColumn(c + 1).width ?? 8.43) * 7 + 5));
  let html = `<body dir="${rtl ? 'rtl' : 'ltr'}" style="font:14px Calibri,Arial,sans-serif;margin:8px"><div style="margin-bottom:4px;color:#555">${sheet.name} — ${rtl ? 'RTL' : 'LTR'}</div><table style="border-collapse:collapse;table-layout:fixed;width:${widths.reduce((a, b) => a + b, 0)}px"><colgroup>${widths.map((w) => `<col style="width:${w}px">`).join('')}</colgroup>`;
  sheet.eachRow({ includeEmpty: false }, (row) => {
    html += `<tr style="height:${row.height ?? 20}px">`;
    for (let c = 1; c <= cols; c++) {
      const cell = row.getCell(c);
      let v = cell.value;
      if (v && typeof v === 'object' && 'formula' in v) v = v.result;
      const fill = cell.fill?.fgColor?.argb ? `#${cell.fill.fgColor.argb.slice(2)}` : 'transparent';
      const color = cell.font?.color?.argb ? `#${cell.font.color.argb.slice(2)}` : '#000';
      const wrap = cell.alignment?.wrapText ? 'white-space:normal' : 'white-space:nowrap';
      html += `<td style="border:1px solid #d0d0d0;background:${fill};color:${color};font-weight:${cell.font?.bold ? 700 : 400};text-align:${cell.alignment?.horizontal ?? 'start'};overflow:hidden;text-overflow:clip;${wrap};padding:1px 3px">${v ?? ''}</td>`;
    }
    html += '</tr>';
  });
  html += '</table></body>';
  const page = await browser.newPage({ viewport: { width: Math.max(900, widths.reduce((a, b) => a + b, 0) + 40), height: 800 } });
  await page.setContent(html);
  await page.screenshot({ path: path.join(outDir, `${name}-${++i}-${sheet.name.replace(/[^\w]+/g, '_')}.png`), fullPage: true });
  await page.close();
}
await browser.close();
console.log(`${i} sheet(s) → ${outDir}`);
