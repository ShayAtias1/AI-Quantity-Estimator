// BetterCalc Revision Compare product demo recording.
//
// Drives a short, realistic Compare flow against the real dev server and records it:
//   new comparison -> load Original + Revision B -> Overlay -> Swipe (sweep the divider across the
//   plan) -> calibrate -> mark one demolition + one new-construction change -> open Changes panel.
//
// The two demo PDFs share the same page size, scale and drawing position (verified: identical
// 1190.551x841.8898pt page and an identical 5.00 m reference dimension line), so no alignment step
// is needed. Coordinates for calibration and the two change markers come from diffing the actual
// vector wall geometry of both PDFs (see demo/inspect-pdf.mjs / the diff notes in this file) — the
// bedroom1/bedroom2 partition wall moved ~0.35 m, which is the one change marked here twice: once
// where the old wall used to stand (demolition) and once at its new position (construction).
//
// Does not touch app code. Run with: node demo/compare-demo.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readdir, rename } from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(__dirname, 'output');
const ORIGINAL_PDF = path.join(__dirname, 'assets', 'BetterCalc_Demo_Apartment_A_Floor_Plan.pdf');
const REVISION_PDF = path.join(__dirname, 'assets', 'BetterCalc_Demo_Apartment_A_Revision_B.pdf');
// A dedicated port, not the project's usual :5173 — this machine may already have an unrelated
// Vite dev server bound there, and silently talking to the wrong app is worse than a fixed port.
const DEV_PORT = 5184;
const DEV_URL = `http://localhost:${DEV_PORT}`;
const VIEWPORT = { width: 1600, height: 1000 };

// Native PDF page size (points at scale 1 == BetterCalc's native page pixels). Identical for both
// PDFs. Top-left origin / y-down, so every point is pre-converted: nativeY = PAGE.height - pdfY.
const PAGE = { width: 1190.551, height: 841.8898 };
const toNative = (pdfX, pdfY) => ({ x: pdfX, y: PAGE.height - pdfY });

// The drawing's own 5.00 m reference dimension line — identical vector position in both PDFs.
const CALIBRATION_REFERENCE = {
  a: toNative(177.2, 68.12),
  b: toNative(497.2, 68.12),
  meters: 5,
};

// The bedroom1/bedroom2 partition wall, diffed between the two PDFs' actual wall-fill rectangles:
//   Original wall: pdf x[325.68, 335.92], y[191, 485.4]
//   Revision B wall: pdf x[348.08, 358.32], y[191, 485.4]  (moved ~22.4pt / 0.35m right)
// Marked as one demolition (the vacated old footprint) and one construction (the new footprint).
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

function pause(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log('Starting dev server...');
  const devServer = startDevServer();

  let browser;
  try {
    await waitForServer(DEV_URL, 30_000);
    console.log('Dev server is up.');

    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: VIEWPORT,
      recordVideo: { dir: OUT_DIR, size: VIEWPORT },
    });
    const page = await context.newPage();
    page.on('dialog', (dialog) => dialog.dismiss());

    const shots = [];
    const shot = async (name) => {
      const p = path.join(OUT_DIR, `${name}.png`);
      await page.screenshot({ path: p });
      shots.push(p);
      console.log('Screenshot:', p);
    };

    let cursor = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 };
    const moveClick = async (x, y, { settleMs = 250 } = {}) => {
      const dist = Math.hypot(x - cursor.x, y - cursor.y);
      const steps = Math.max(8, Math.min(30, Math.round(dist / 25)));
      await page.mouse.move(x, y, { steps });
      cursor = { x, y };
      await pause(settleMs);
      await page.mouse.down();
      await pause(40);
      await page.mouse.up();
    };

    const canvas = page.locator('.viewer-area canvas').first();
    const nativeToScreen = async ({ x, y }) => {
      const box = await canvas.boundingBox();
      return {
        x: box.x + (x / PAGE.width) * box.width,
        y: box.y + (y / PAGE.height) * box.height,
      };
    };

    console.log('Opening BetterCalc...');
    await page.goto(DEV_URL, { waitUntil: 'networkidle' });
    await pause(1000);

    // --- Switch to Revision Compare and create a new comparison --------------------------------
    await page.getByRole('button', { name: 'השוואת תוכניות' }).click();
    await pause(500);
    await page.getByRole('button', { name: 'השוואה חדשה' }).click();
    await pause(400);

    const fileInputs = page.locator('.modal input[type="file"]');
    await fileInputs.nth(0).setInputFiles(ORIGINAL_PDF);
    await pause(250);
    await fileInputs.nth(1).setInputFiles(REVISION_PDF);
    await pause(300);
    const nameField = page.locator('.modal input[type="text"], .modal input:not([type])').first();
    await nameField.fill('Apartment A - Rev B');
    await pause(400);
    await page.getByRole('button', { name: 'צור השוואה' }).click();

    // --- Wait for both layers to render -----------------------------------------------------
    await canvas.waitFor({ state: 'visible', timeout: 15_000 });
    await page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        return !!el && el.getBoundingClientRect().width > 0;
      },
      '.viewer-area canvas',
      { timeout: 15_000 },
    );
    await pause(1500); // let both rasters finish, then hold on the default Overlay view
    await shot('01-overlay');

    // --- Calibrate (original layer) -------------------------------------------------------------
    await page.getByRole('button', { name: 'כייל עכשיו' }).click();
    await pause(500);
    const calA = await nativeToScreen(CALIBRATION_REFERENCE.a);
    const calB = await nativeToScreen(CALIBRATION_REFERENCE.b);
    await moveClick(calA.x, calA.y);
    await pause(400);
    await moveClick(calB.x, calB.y);
    await pause(600);
    await page.locator('.calibration-modal input[type="number"]').fill(String(CALIBRATION_REFERENCE.meters));
    await pause(500);
    await page.getByRole('button', { name: 'אישור כיול' }).click();
    await pause(900);

    // --- Switch to Swipe and sweep the divider across the plan ---------------------------------
    await page.locator('.compare-context').scrollIntoViewIfNeeded().catch(() => {});
    await page.getByRole('button', { name: 'החלקה' }).click();
    await pause(600);

    const divider = page.locator('.swipe-divider');
    const box = await canvas.boundingBox();
    const midY = box.y + box.height / 2;
    const xAt = (frac) => box.x + frac * box.width;

    await page.mouse.move(xAt(0.5), midY, { steps: 10 });
    await page.mouse.down();
    await pause(150);
    await page.mouse.move(xAt(0.08), midY, { steps: 24 });
    await pause(600); // hold — mostly showing Revision B
    await shot('02-swipe-revised');
    await page.mouse.move(xAt(0.92), midY, { steps: 40 });
    await pause(600); // hold — mostly showing the Original
    await shot('03-swipe-original');
    await page.mouse.move(xAt(0.5), midY, { steps: 30 });
    await pause(500); // settle back to a balanced split
    await page.mouse.up();
    void divider;
    await pause(700);
    await shot('04-swipe-mid');

    // --- Mark one demolition and one new-construction change ------------------------------------
    await page.getByRole('button', { name: 'כיול ומדידה' }).click();
    await pause(500);

    await page.locator('.measure-toolbar').getByRole('button', { name: 'הריסה', exact: true }).click();
    await pause(400);
    await page.locator('.measure-toolbar').getByRole('button', { name: 'מלבן', exact: true }).click();
    await pause(400);
    const d1 = await nativeToScreen(DEMOLITION_RECT.p1);
    await moveClick(d1.x, d1.y);
    await pause(250);
    const d2 = await nativeToScreen(DEMOLITION_RECT.p2);
    await moveClick(d2.x, d2.y);
    await pause(900); // hold on the demolition mark

    await page.locator('.measure-toolbar').getByRole('button', { name: 'בנייה חדשה', exact: true }).click();
    await pause(400);
    const c1 = await nativeToScreen(CONSTRUCTION_RECT.p1);
    await moveClick(c1.x, c1.y);
    await pause(250);
    const c2 = await nativeToScreen(CONSTRUCTION_RECT.p2);
    await moveClick(c2.x, c2.y);
    await pause(900); // hold on the construction mark
    await shot('05-marked-changes');

    // --- Open the Changes panel and hold on the result -------------------------------------------
    await page.getByTitle('פתח את חלונית השינויים').click();
    await pause(1400);
    await shot('06-changes-panel');
    await pause(2200); // final hold on the result

    await context.close();
    await browser.close();
    browser = undefined;

    const files = await readdir(OUT_DIR);
    const webm = files.find((f) => f.endsWith('.webm'));
    let videoPath = null;
    if (webm) {
      videoPath = path.join(OUT_DIR, 'compare-demo.webm');
      await rename(path.join(OUT_DIR, webm), videoPath);
    }

    console.log('\nCompare demo recording complete.');
    console.log('Video:', videoPath ?? '(none captured)');
    console.log('Screenshots:', shots.join(', '));
  } finally {
    if (browser) await browser.close();
    devServer.kill();
  }
}

main().catch((err) => {
  console.error('Compare demo run failed:', err);
  process.exit(1);
});
