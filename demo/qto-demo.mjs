// BetterCalc QTO product demo recording.
//
// Drives a full, realistic quantity-takeoff flow against the real dev server and records it:
//   open -> new project -> upload plan -> calibrate (5.00 m reference) -> create apartment ->
//   draw a few representative rooms -> assign room type + work item -> open quantities panel.
//
// Coordinates for calibration and room rectangles are derived from the actual vector geometry of
// demo/assets/BetterCalc_Demo_Apartment_A_Floor_Plan.pdf (wall fills and the reference dimension
// line), extracted once with demo/inspect-pdf.mjs — see NATIVE_POINTS below.
//
// Does not touch app code. Run with: node demo/qto-demo.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readdir, rename } from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(__dirname, 'output');
const PDF_PATH = path.join(__dirname, 'assets', 'BetterCalc_Demo_Apartment_A_Floor_Plan.pdf');
// A dedicated port, not the project's usual :5173 — this machine may already have an unrelated
// Vite dev server bound there, and silently talking to the wrong app is worse than a fixed port.
const DEV_PORT = 5183;
const DEV_URL = `http://localhost:${DEV_PORT}`;
const VIEWPORT = { width: 1600, height: 1000 };

// Native PDF page size (points at scale 1 == BetterCalc's native page pixels), and the points of
// interest on the plan, extracted from the PDF's own vector geometry (see demo/inspect-pdf.mjs).
// PDF space is bottom-left origin / y-up; BetterCalc's native space is top-left origin / y-down,
// so every point here is pre-converted: nativeY = PAGE.height - pdfY.
const PAGE = { width: 1190.551, height: 841.8898 };
const toNative = (pdfX, pdfY) => ({ x: pdfX, y: PAGE.height - pdfY });

// The drawing's own 5.00 m reference dimension line (exactly 320pt = 5.00 m at this plan's scale).
const CALIBRATION_REFERENCE = {
  a: toNative(177.2, 68.12),
  b: toNative(497.2, 68.12),
  meters: 5,
};

// Three representative rooms as axis-aligned rectangles sitting cleanly inside each room's drawn
// walls (corners are inner wall faces, verified against the plan's own wall-fill rectangles).
const ROOMS = [
  {
    label: 'Master Bedroom',
    roomTypeLabel: 'חדר שינה', // ROOM_PROFILES 'bedroom'
    roomName: 'חדר הורים',
    p1: toNative(135, 694.04),
    p2: toNative(389.68, 490.52),
  },
  {
    label: 'Bedroom 1',
    roomTypeLabel: 'חדר שינה',
    roomName: 'חדר שינה',
    p1: toNative(135, 480.28),
    p2: toNative(325.68, 199.96),
  },
  {
    label: 'Living Room',
    roomTypeLabel: 'סלון', // ROOM_PROFILES 'living'
    roomName: 'סלון',
    p1: toNative(658.72, 531.48),
    p2: toNative(949.04, 199.96),
  },
];

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

    // Only the "new apartment" prompt is expected during this flow.
    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') await dialog.accept('A');
      else await dialog.dismiss();
    });

    const shots = [];
    const shot = async (name) => {
      const p = path.join(OUT_DIR, `${name}.png`);
      await page.screenshot({ path: p });
      shots.push(p);
      console.log('Screenshot:', p);
    };

    // Smooth, human-paced mouse move + click, so the recording doesn't look like teleporting clicks.
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

    // Native (PDF page pixel) point -> current on-screen point, via the canvas's live bounding box
    // (works regardless of the viewer's own zoom/pan, which never changes in this script).
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

    // --- New project -------------------------------------------------------------------------
    await page.getByRole('button', { name: 'פרויקט חדש' }).click();
    await pause(300);
    await page.locator('input[type="file"]').setInputFiles(PDF_PATH);
    await pause(200);
    const nameField = page.locator('.modal input[type="text"], .modal input:not([type])').first();
    await nameField.fill('Apartment A - Demo');
    await pause(400);
    await page.getByRole('button', { name: 'צור פרויקט' }).click();

    // --- Wait for the plan to render ---------------------------------------------------------
    await canvas.waitFor({ state: 'visible', timeout: 15_000 });
    await page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        return !!el && el.getBoundingClientRect().width > 0;
      },
      '.viewer-area canvas',
      { timeout: 15_000 },
    );
    await pause(1600); // let pdf.js finish rasterizing, then hold on the rendered plan
    await shot('01-plan-rendered');

    // --- Calibration ---------------------------------------------------------------------------
    await page.getByRole('button', { name: 'כיול קנה מידה' }).click();
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
    await pause(1400);
    await shot('02-calibrated');

    // --- Create the apartment ------------------------------------------------------------------
    await page.locator('#active-apartment').selectOption('__new__');
    await pause(1000); // prompt() round-trip is handled by the dialog listener above

    // --- Draw representative rooms --------------------------------------------------------------
    for (const room of ROOMS) {
      console.log('Drawing room:', room.label);
      await page.locator('.toolbar').getByRole('button', { name: 'מלבן', exact: true }).click();
      await pause(400);
      const s1 = await nativeToScreen(room.p1);
      await moveClick(s1.x, s1.y);
      await pause(300);
      const s2 = await nativeToScreen(room.p2);
      await moveClick(s2.x, s2.y);
      await pause(600); // room detail panel opens

      await page.locator('.room-detail select').first().selectOption({ label: room.roomTypeLabel });
      await pause(700);
      const nameInput = page.locator('.room-detail .form-grid input').first();
      await nameInput.fill('');
      await nameInput.fill(room.roomName);
      await pause(500);
      await page.getByRole('button', { name: 'ריצוף', exact: true }).click();
      await pause(1300); // hold on the computed quantity for this room
    }
    await shot('03-rooms-with-quantities');

    // --- Show the final quantities result -------------------------------------------------------
    await page.getByTitle('פתח את טבלת הכמויות').click();
    await pause(1600);
    await shot('04-quantities-panel');
    await pause(2600); // final hold on the result

    await context.close();
    await browser.close();
    browser = undefined;

    const files = await readdir(OUT_DIR);
    const webm = files.find((f) => f.endsWith('.webm'));
    let videoPath = null;
    if (webm) {
      videoPath = path.join(OUT_DIR, 'qto-demo.webm');
      await rename(path.join(OUT_DIR, webm), videoPath);
    }

    console.log('\nQTO demo recording complete.');
    console.log('Video:', videoPath ?? '(none captured)');
    console.log('Screenshots:', shots.join(', '));
  } finally {
    if (browser) await browser.close();
    devServer.kill();
  }
}

main().catch((err) => {
  console.error('QTO demo run failed:', err);
  process.exit(1);
});
