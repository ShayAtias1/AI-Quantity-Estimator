// Additional footage for the launch video (second editing pass). Records only what the approved
// qto-demo / compare-demo recordings don't cover, at a deliberate, readable pace:
//
//   qto-export.webm        — same QTO flow as qto-demo (fast; only its tail is used), then the
//                            quantities report leaves the app: Export menu -> PDF, then -> Excel.
//   compare-extended.webm  — Compare flow with the pacing the edit needs: Overlay with the revision
//                            layer's opacity swept and visibility toggled, a slow Swipe across the
//                            moved wall, demolition then new construction marked with holds, the
//                            Changes panel, and the comparison PDF export.
//
// The exported files are saved to demo/output/reports/ so the edit can show the real report pages.
// Geometry is the same as qto-demo.mjs / compare-demo.mjs (derived from the demo PDFs' vectors).
//
// Does not touch app code. Run with: node demo/extra-footage.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readdir, rename } from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(__dirname, 'output');
const REPORT_DIR = path.join(OUT_DIR, 'reports');
const ORIGINAL_PDF = path.join(__dirname, 'assets', 'BetterCalc_Demo_Apartment_A_Floor_Plan.pdf');
const REVISION_PDF = path.join(__dirname, 'assets', 'BetterCalc_Demo_Apartment_A_Revision_B.pdf');
const DEV_PORT = 5185;
const DEV_URL = `http://localhost:${DEV_PORT}`;
const VIEWPORT = { width: 1600, height: 1000 };

const PAGE = { width: 1190.551, height: 841.8898 };
const toNative = (pdfX, pdfY) => ({ x: pdfX, y: PAGE.height - pdfY });

const CALIBRATION_REFERENCE = { a: toNative(177.2, 68.12), b: toNative(497.2, 68.12), meters: 5 };

const ROOMS = [
  { roomTypeLabel: 'חדר שינה', roomName: 'חדר הורים', p1: toNative(135, 694.04), p2: toNative(389.68, 490.52) },
  { roomTypeLabel: 'חדר שינה', roomName: 'חדר שינה', p1: toNative(135, 480.28), p2: toNative(325.68, 199.96) },
  { roomTypeLabel: 'סלון', roomName: 'סלון', p1: toNative(658.72, 531.48), p2: toNative(949.04, 199.96) },
];

// Original bedroom partition vs. its Revision B position (moved ~0.35 m).
const DEMOLITION_RECT = { p1: toNative(325.68, 191), p2: toNative(335.92, 485.4) };
const CONSTRUCTION_RECT = { p1: toNative(348.08, 191), p2: toNative(358.32, 485.4) };

async function waitForServer(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Dev server did not respond at ${url} within ${timeoutMs}ms`);
}

function startDevServer() {
  const proc = spawn('npm', ['run', 'dev', '--', '--port', String(DEV_PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
  proc.stdout.on('data', (d) => process.stdout.write(`[vite] ${d}`));
  proc.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
  return proc;
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Page helpers bound to one recorded page. */
function helpers(page) {
  let cursor = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 };

  // Real-time mouse glide (one move per ~16 ms) so slow drags read as smooth motion on video.
  const glide = async (x, y, ms) => {
    const steps = Math.max(2, Math.round(ms / 16));
    const from = cursor;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
      await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
      await pause(16);
    }
    cursor = { x, y };
  };
  const click = async (x, y, ms = 450) => {
    await glide(x, y, ms);
    await pause(200);
    await page.mouse.down();
    await pause(50);
    await page.mouse.up();
  };
  const clickLocator = async (locator, ms = 450) => {
    const box = await locator.boundingBox();
    await click(box.x + box.width / 2, box.y + box.height / 2, ms);
  };
  const hoverLocator = async (locator, ms = 450) => {
    const box = await locator.boundingBox();
    await glide(box.x + box.width / 2, box.y + box.height / 2, ms);
  };

  const canvas = page.locator('.viewer-area canvas').first();
  const nativeToScreen = async ({ x, y }) => {
    const box = await canvas.boundingBox();
    return { x: box.x + (x / PAGE.width) * box.width, y: box.y + (y / PAGE.height) * box.height };
  };
  const waitForCanvas = async () => {
    await canvas.waitFor({ state: 'visible', timeout: 15_000 });
    await page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        return !!el && el.getBoundingClientRect().width > 0;
      },
      '.viewer-area canvas',
      { timeout: 15_000 },
    );
  };
  const calibrate = async (ms) => {
    await click(...Object.values(await nativeToScreen(CALIBRATION_REFERENCE.a)), ms);
    await pause(250);
    await click(...Object.values(await nativeToScreen(CALIBRATION_REFERENCE.b)), ms);
    await pause(400);
    await page.locator('.calibration-modal input[type="number"]').fill(String(CALIBRATION_REFERENCE.meters));
    await pause(300);
    await page.getByRole('button', { name: 'אישור כיול' }).click();
  };
  const download = async (trigger, name) => {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), trigger()]);
    const p = path.join(REPORT_DIR, name);
    await dl.saveAs(p);
    console.log('Saved report:', p);
  };
  return { glide, click, clickLocator, hoverLocator, canvas, nativeToScreen, waitForCanvas, calibrate, download };
}

async function record(browser, name, flow) {
  const before = new Set((await readdir(OUT_DIR)).filter((f) => f.endsWith('.webm')));
  const context = await browser.newContext({ viewport: VIEWPORT, recordVideo: { dir: OUT_DIR, size: VIEWPORT } });
  const page = await context.newPage();
  await flow(page);
  await context.close();
  const created = (await readdir(OUT_DIR)).find((f) => f.endsWith('.webm') && !before.has(f));
  if (!created) throw new Error(`No video captured for ${name}`);
  await rename(path.join(OUT_DIR, created), path.join(OUT_DIR, name));
  console.log('Video:', path.join(OUT_DIR, name));
}

// --- QTO: rebuild the approved project quickly, then export the quantities report ---------------
async function qtoExport(page) {
  const h = helpers(page);
  page.on('dialog', async (d) => (d.type() === 'prompt' ? d.accept('A') : d.dismiss()));

  await page.goto(DEV_URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'פרויקט חדש' }).click();
  await page.locator('input[type="file"]').setInputFiles(ORIGINAL_PDF);
  await page.locator('.modal input[type="text"], .modal input:not([type])').first().fill('Apartment A - Demo');
  await page.getByRole('button', { name: 'צור פרויקט' }).click();
  await h.waitForCanvas();
  await pause(1200);

  await page.getByRole('button', { name: 'כיול קנה מידה' }).click();
  await pause(300);
  await h.calibrate(250);
  await pause(600);
  await page.locator('#active-apartment').selectOption('__new__');
  await pause(600);

  for (const room of ROOMS) {
    await page.locator('.toolbar').getByRole('button', { name: 'מלבן', exact: true }).click();
    await pause(200);
    await h.click(...Object.values(await h.nativeToScreen(room.p1)), 250);
    await pause(150);
    await h.click(...Object.values(await h.nativeToScreen(room.p2)), 250);
    await pause(400);
    await page.locator('.room-detail select').first().selectOption({ label: room.roomTypeLabel });
    await pause(250);
    const nameInput = page.locator('.room-detail .form-grid input').first();
    await nameInput.fill('');
    await nameInput.fill(room.roomName);
    await page.getByRole('button', { name: 'ריצוף', exact: true }).click();
    await pause(400);
  }

  await page.getByTitle('פתח את טבלת הכמויות').click();
  await pause(2500); // <- the edit picks up from here: panel open, same state as the approved clip

  const exportBtn = page.locator('.top-bar-menu-btn', { hasText: 'ייצוא' });
  const pdfItem = page.locator('.menu-item', { hasText: 'כתב כמויות — PDF' });
  const excelItem = page.locator('.menu-item', { hasText: 'כתב כמויות — Excel' });

  await h.clickLocator(exportBtn, 900);
  await pause(1800); // hold on the open menu: Excel + PDF reports
  await h.hoverLocator(excelItem, 500);
  await pause(900);
  await h.hoverLocator(pdfItem, 400);
  await pause(700);
  await h.download(() => h.clickLocator(pdfItem, 200), 'qto-report.pdf');
  await pause(1500);

  await h.clickLocator(exportBtn, 700);
  await pause(1000);
  await h.hoverLocator(excelItem, 400);
  await pause(600);
  await h.download(() => h.clickLocator(excelItem, 200), 'qto-quantities.xlsx');
  await pause(2000);
}

// --- Compare: overlay, slow swipe, demolition/new construction, Changes, export -----------------
async function compareExtended(page) {
  const h = helpers(page);
  page.on('dialog', (d) => d.dismiss());

  await page.goto(DEV_URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'השוואת תוכניות' }).click();
  await pause(300);
  await page.getByRole('button', { name: 'השוואה חדשה' }).click();
  const fileInputs = page.locator('.modal input[type="file"]');
  await fileInputs.nth(0).setInputFiles(ORIGINAL_PDF);
  await fileInputs.nth(1).setInputFiles(REVISION_PDF);
  await page.locator('.modal input[type="text"], .modal input:not([type])').first().fill('Apartment A - Rev B');
  await page.getByRole('button', { name: 'צור השוואה' }).click();
  await h.waitForCanvas();
  await pause(1200);

  // Calibrate up front (not used in the edit) so the overlay shots have no warning banner.
  await page.getByRole('button', { name: 'כייל עכשיו' }).click();
  await pause(300);
  await h.calibrate(250);
  await pause(800);
  await page.getByRole('button', { name: 'שכבות ויישור' }).click();
  await pause(2500); // <- OVERLAY section starts: both revisions superimposed

  // Revision layer opacity: sweep to 0 (original only), to 100% (revision on top), settle at 50%.
  // The panel is RTL, so the range fills from the right: value v sits at right - v * width.
  const slider = page.locator('.layer-row').nth(1).locator('input[type="range"]');
  const sb = await slider.boundingBox();
  const inset = 8; // thumb radius
  const xAt = (v) => sb.x + sb.width - inset - v * (sb.width - 2 * inset);
  const sy = sb.y + sb.height / 2;
  await h.glide(xAt(0.75), sy, 900);
  await pause(300);
  await page.mouse.down();
  await h.glide(xAt(0), sy, 1800);
  await pause(1600); // original only
  await h.glide(xAt(1), sy, 2600);
  await pause(1600); // revision fully on top
  await h.glide(xAt(0.5), sy, 1400);
  await page.mouse.up();
  await pause(1800); // both at once — the differences read as grey vs red

  // Visibility: hide the revision, then bring it back.
  const eye = page.locator('.layer-row').nth(1).locator('.layer-row-header .icon-btn');
  await h.clickLocator(eye, 700);
  await pause(1500);
  await h.clickLocator(eye, 300);
  await pause(2200);

  // --- Swipe ------------------------------------------------------------------------------------
  await h.clickLocator(page.getByRole('button', { name: 'החלקה', exact: true }), 800);
  await pause(1200);
  const box = await h.canvas.boundingBox();
  const midY = box.y + box.height * 0.55;
  const fx = (f) => box.x + f * box.width;
  await h.glide(fx(0.5), midY, 700);
  await pause(300);
  await page.mouse.down();
  await h.glide(fx(0.18), midY, 3200); // slowly back across the bedrooms
  await pause(900);
  await h.glide(fx(0.42), midY, 3000); // and forward over the moved wall
  await pause(900);
  await h.glide(fx(0.8), midY, 3200);
  await pause(700);
  await h.glide(fx(0.5), midY, 1800);
  await page.mouse.up();
  await pause(1500);

  // --- Demolition / new construction, drawn in Overlay so both walls are visible -----------------
  await h.clickLocator(page.getByRole('button', { name: 'שכבות', exact: true }), 700);
  await pause(1000);
  await h.clickLocator(page.getByRole('button', { name: 'כיול ומדידה' }), 700);
  await pause(1000);
  const mt = page.locator('.measure-toolbar');
  await h.clickLocator(mt.getByRole('button', { name: 'הריסה', exact: true }), 600);
  await pause(500);
  await h.clickLocator(mt.getByRole('button', { name: 'מלבן', exact: true }), 500);
  await pause(700);
  await h.click(...Object.values(await h.nativeToScreen(DEMOLITION_RECT.p1)), 900);
  await pause(300);
  await h.click(...Object.values(await h.nativeToScreen(DEMOLITION_RECT.p2)), 1300);
  await pause(3000); // hold on demolition

  await h.clickLocator(mt.getByRole('button', { name: 'בנייה חדשה', exact: true }), 900);
  await pause(700);
  await h.click(...Object.values(await h.nativeToScreen(CONSTRUCTION_RECT.p1)), 1100);
  await pause(300);
  await h.click(...Object.values(await h.nativeToScreen(CONSTRUCTION_RECT.p2)), 1300);
  await pause(3200); // hold on both

  // --- Changes panel ------------------------------------------------------------------------------
  await h.clickLocator(page.getByTitle('פתח את חלונית השינויים'), 900);
  await pause(4500);

  // --- Export the comparison report (PDF: plan + demolition/new-construction table) -------------
  const exportBtn = page.locator('.top-bar-menu-btn', { hasText: 'ייצוא' });
  await h.clickLocator(exportBtn, 1000);
  await pause(2200);
  const exportItem = page.locator('.menu-item', { hasText: '— Rev B' }).or(page.locator('.menu-item', { hasText: '— מעודכן' })).first();
  await h.hoverLocator(exportItem, 600);
  await pause(1000);
  await h.download(() => h.clickLocator(exportItem, 200), 'compare-report.pdf');
  await pause(2500);
}

async function main() {
  await mkdir(REPORT_DIR, { recursive: true });
  const devServer = startDevServer();
  let browser;
  try {
    await waitForServer(DEV_URL, 30_000);
    browser = await chromium.launch();
    const only = process.argv[2];
    if (!only || only === 'qto') await record(browser, 'qto-export.webm', qtoExport);
    if (!only || only === 'compare') await record(browser, 'compare-extended.webm', compareExtended);
  } finally {
    if (browser) await browser.close();
    devServer.kill();
  }
}

main().catch((err) => {
  console.error('Extra footage run failed:', err);
  process.exit(1);
});
