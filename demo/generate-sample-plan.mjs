// Generates a simple synthetic floor-plan PDF used only as demo input.
// Not part of the app; run with: node demo/generate-sample-plan.mjs
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, 'assets', 'sample-plan.pdf');

const PAGE_W = 1000;
const PAGE_H = 700;

const doc = await PDFDocument.create();
const page = doc.addPage([PAGE_W, PAGE_H]);
const font = await doc.embedFont(StandardFonts.Helvetica);

const wall = rgb(0.1, 0.1, 0.1);
const thin = 3;

function rectWalls(x, y, w, h) {
  page.drawRectangle({ x, y, width: w, height: thin, color: wall });
  page.drawRectangle({ x, y: y + h - thin, width: w, height: thin, color: wall });
  page.drawRectangle({ x, y, width: thin, height: h, color: wall });
  page.drawRectangle({ x: x + w - thin, y, width: thin, height: h, color: wall });
}

// Outer envelope
rectWalls(100, 100, 800, 500);
// Interior partition walls forming three rooms
page.drawRectangle({ x: 400, y: 100, width: thin, height: 300, color: wall });
page.drawRectangle({ x: 400, y: 400, width: 400, height: thin, color: wall });
page.drawRectangle({ x: 650, y: 400, width: thin, height: 200, color: wall });

page.drawText('Sample Floor Plan - Demo Only', {
  x: 100,
  y: 630,
  size: 18,
  font,
  color: rgb(0, 0, 0),
});
page.drawText('Living Room', { x: 160, y: 350, size: 14, font, color: wall });
page.drawText('Bedroom', { x: 470, y: 500, size: 14, font, color: wall });
page.drawText('Bathroom', { x: 470, y: 250, size: 14, font, color: wall });

const bytes = await doc.save();
await writeFile(outPath, bytes);
console.log('Wrote', outPath);
