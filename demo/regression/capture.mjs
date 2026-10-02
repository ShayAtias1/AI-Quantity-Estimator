// Before/after regression capture for changes that must not alter what BetterCalc shows or exports.
//
// Seeds IndexedDB with records in the shapes older builds saved (demo/regression/fixtures.mjs),
// reloads so the app's own lazy migrations run, then drives the real UI and records:
//   - screenshots of the plan and comparison viewers,
//   - the user-space box of every text element on the overlay, under the app's RTL page AND with the
//     page forced to dir="ltr" (a saved note must not move when the surrounding UI direction changes),
//   - the real Hebrew exports: plan Excel + PDF, plan-page PDF, project Excel + PDF, comparison PDF,
//   - the saved records as they stand at the end of the session.
//
// Run: node demo/regression/capture.mjs <label>     → demo/output/regression/<label>/
// Then: node demo/regression/compare.mjs <labelA> <labelB>
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { LEGACY_COMPARISON, LEGACY_PLAN } from './fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const label = process.argv[2];
if (!label) {
  console.error('usage: node demo/regression/capture.mjs <label>');
  process.exit(1);
}
const OUT = path.join(ROOT, 'demo', 'output', 'regression', label);
const ORIGINAL_PDF = path.join(ROOT, 'demo', 'assets', 'BetterCalc_Demo_Apartment_A_Floor_Plan.pdf');
const REVISION_PDF = path.join(ROOT, 'demo', 'assets', 'BetterCalc_Demo_Apartment_A_Revision_B.pdf');
// Own port: never talk to whatever else may be running on :5173 / the demos' :5183.
const DEV_PORT = 5187;
const DEV_URL = `http://localhost:${DEV_PORT}`;
const VIEWPORT = { width: 1600, height: 1000 };

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

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Writes the fixtures into the app's database as raw records, exactly as an old build left them. */
async function seed(page) {
  const [original, revision] = await Promise.all([readFile(ORIGINAL_PDF), readFile(REVISION_PDF)]);
  await page.evaluate(
    async ({ plan, comparison, originalB64, revisionB64 }) => {
      const blob = (b64) => new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'application/pdf' });
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('bettercalc-qto', 3);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction(['projects', 'pdfFiles', 'comparisons', 'comparePdfFiles'], 'readwrite');
      tx.objectStore('projects').put(plan);
      tx.objectStore('pdfFiles').put(blob(originalB64), plan.id);
      tx.objectStore('comparisons').put(comparison);
      tx.objectStore('comparePdfFiles').put(blob(originalB64), `${comparison.id}:original`);
      tx.objectStore('comparePdfFiles').put(blob(revisionB64), `${comparison.id}:revised`);
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { plan: LEGACY_PLAN, comparison: LEGACY_COMPARISON, originalB64: original.toString('base64'), revisionB64: revision.toString('base64') }
  );
}

/** Every saved record (blobs left out), for inspecting what the session wrote back. */
async function dumpDatabase(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('bettercalc-qto', 3);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const out = {};
    for (const store of ['projects', 'takeoffProjects', 'comparisons']) {
      out[store] = await new Promise((resolve, reject) => {
        const req = db.transaction(store).objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    db.close();
    return out;
  });
}

async function waitForPlanRender(page) {
  await page.locator('.pdf-viewport canvas').first().waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForFunction(() => {
    const c = document.querySelector('.pdf-viewport canvas');
    return !!c && c.width > 0 && c.getBoundingClientRect().width > 0;
  });
  await pause(2500); // pdf.js rasterizes after layout; hold until the plan is painted
}

/** User-space box and text of every <text> on the overlay — independent of zoom and pan. */
async function overlayTexts(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.pdf-viewport .overlay-svg text')).map((t) => {
      const b = t.getBBox();
      const r = (v) => Math.round(v * 100) / 100;
      return { text: t.textContent, x: r(b.x), y: r(b.y), width: r(b.width), height: r(b.height) };
    })
  );
}

/** Screenshot + overlay text boxes in the app's own RTL, then with the page forced to LTR. */
async function captureViewer(page, name, results) {
  await page.locator('.pdf-viewport').screenshot({ path: path.join(OUT, `${name}-rtl.png`) });
  results[`${name}-rtl`] = await overlayTexts(page);
  await page.evaluate(() => document.documentElement.setAttribute('dir', 'ltr'));
  await pause(400);
  results[`${name}-ltr`] = await overlayTexts(page);
  await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
  await pause(400);
}

async function download(page, trigger, file) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), trigger()]);
  await dl.saveAs(path.join(OUT, file));
  console.log(`  saved ${file} (${dl.suggestedFilename()})`);
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const devServer = spawn('npm', ['run', 'dev', '--', '--port', String(DEV_PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
  devServer.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
  let browser;
  try {
    await waitForServer(DEV_URL, 30_000);
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('dialog', (d) => {
      errors.push(`dialog: ${d.message()}`);
      void d.dismiss();
    });

    await page.goto(DEV_URL);
    await page.getByRole('button', { name: 'פרויקט חדש' }).waitFor();
    await seed(page);
    await page.reload();

    const results = {};

    // ---- Quantity takeoff: the legacy plan, wrapped into a project on load ----
    console.log('plan');
    await page.locator('.saved-list li', { hasText: 'פרויקט רגרסיה' }).click();
    await page.locator('li[title="פתח את התוכנית"]').first().click();
    await waitForPlanRender(page);
    await captureViewer(page, 'plan', results);

    const openExportMenu = () => page.locator('.top-bar-menu-btn', { hasText: 'ייצוא' }).click();
    await download(page, async () => { await openExportMenu(); await page.getByRole('button', { name: 'כתב כמויות — Excel' }).click(); }, 'plan.xlsx');
    await download(page, async () => { await openExportMenu(); await page.getByRole('button', { name: 'כתב כמויות — PDF' }).click(); }, 'plan.pdf');
    await download(page, async () => { await openExportMenu(); await page.getByRole('button', { name: 'עמוד 1 בלבד' }).click(); }, 'plan-page.pdf');

    // ---- Project overview exports ----
    console.log('project');
    await page.getByTitle('שמירה וחזרה לסקירת הפרויקט').first().click();
    await page.locator('li[title="פתח את התוכנית"]').first().waitFor();
    await download(page, () => page.getByTitle('כתב כמויות לכל תוכניות הפרויקט בקובץ Excel אחד').click(), 'project.xlsx');
    await download(page, () => page.getByTitle('דוח כמויות PDF לכל תוכניות הפרויקט').click(), 'project.pdf');

    // ---- Revision Compare: the legacy single-revised-layer comparison ----
    console.log('comparison');
    await page.getByTitle('חזרה לרשימת הפרויקטים').click();
    await page.locator('.saved-list li', { hasText: 'השוואת רגרסיה' }).click();
    await page.locator('li[title="פתח את ההשוואה"]').first().click();
    await waitForPlanRender(page);
    await captureViewer(page, 'compare', results);
    await download(
      page,
      async () => {
        await page.locator('.top-bar-menu-btn', { hasText: 'ייצוא' }).click();
        await page.locator('.menu-item', { hasText: '— מעודכן' }).first().click();
      },
      'compare.pdf'
    );

    results.database = await dumpDatabase(page);
    results.errors = errors;
    await writeFile(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
    console.log(`done → ${path.relative(ROOT, OUT)}${errors.length ? ` (${errors.length} page errors, see results.json)` : ''}`);
  } finally {
    await browser?.close();
    devServer.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
