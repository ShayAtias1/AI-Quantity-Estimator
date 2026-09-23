import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync } from 'node:fs';

const data = new Uint8Array(readFileSync('/Users/ADMIN/Downloads/BetterCalc_Demo_Apartment_A_Floor_Plan.pdf'));
const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
const page = await doc.getPage(1);
const vp = page.getViewport({ scale: 1 });
console.log('viewport', vp.width, vp.height);
const tc = await page.getTextContent();
for (const item of tc.items) {
  if (!item.str.trim()) continue;
  console.log(JSON.stringify(item.str).padEnd(30), item.transform[4].toFixed(1), item.transform[5].toFixed(1));
}
