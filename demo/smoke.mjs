// BetterCalc demo pipeline — smoke test.
//
// Proves the record/screenshot pipeline works end to end:
//   1. clean browser context
//   2. open BetterCalc (spawns its own `npm run dev`)
//   3. create a new QTO project
//   4. upload a sample PDF
//   5. wait for the plan to finish rendering to canvas
//   6. record video of the whole session
//   7. take one clean screenshot of the rendered workspace
//
// Does not touch app code. Run with: node demo/smoke.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readdir, rename } from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(__dirname, 'output');
const PDF_PATH = path.join(__dirname, 'assets', 'sample-plan.pdf');
// A dedicated port, not the project's usual :5173 — this machine may already have an unrelated
// Vite dev server bound there, and silently talking to the wrong app is worse than a fixed port.
const DEV_PORT = 5183;
const DEV_URL = `http://localhost:${DEV_PORT}`;
const VIEWPORT = { width: 1600, height: 1000 }; // fixed demo viewport

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

    console.log('Opening BetterCalc...');
    await page.goto(DEV_URL, { waitUntil: 'networkidle' });

    // Home screen defaults to the takeoff (QTO) tab already.
    await page.getByRole('button', { name: 'פרויקט חדש' }).click();

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(PDF_PATH);

    const nameField = page.locator('.modal input[type="text"], .modal input:not([type])').first();
    await nameField.fill('Demo Project');

    console.log('Creating project...');
    await page.getByRole('button', { name: 'צור פרויקט' }).click();

    // Wait for the plan canvas to be present, sized, and settled (pdf.js render is async).
    const canvas = page.locator('.viewer-area canvas').first();
    await canvas.waitFor({ state: 'visible', timeout: 15_000 });
    await page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        return !!el && el.getBoundingClientRect().width > 0;
      },
      '.viewer-area canvas',
      { timeout: 15_000 },
    );
    // pdf.js draws asynchronously after the canvas is sized; give it a moment to finish rasterizing.
    await page.waitForTimeout(1500);

    console.log('Taking screenshot...');
    const screenshotPath = path.join(OUT_DIR, 'workspace.png');
    await page.screenshot({ path: screenshotPath });

    await context.close();
    await browser.close();
    browser = undefined;

    // Playwright names video files by internal id; rename to something predictable.
    const files = await readdir(OUT_DIR);
    const webm = files.find((f) => f.endsWith('.webm'));
    let videoPath = null;
    if (webm) {
      videoPath = path.join(OUT_DIR, 'smoke.webm');
      await rename(path.join(OUT_DIR, webm), videoPath);
    }

    console.log('\nSmoke run complete.');
    console.log('Screenshot:', screenshotPath);
    console.log('Video:', videoPath ?? '(none captured)');
  } finally {
    if (browser) await browser.close();
    devServer.kill();
  }
}

main().catch((err) => {
  console.error('Smoke run failed:', err);
  process.exit(1);
});
