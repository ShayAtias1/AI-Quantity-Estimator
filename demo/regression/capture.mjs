// Before/after regression capture for changes that must not alter what BetterCalc shows or exports.
//
// Seeds IndexedDB with records in the shapes older builds saved (demo/regression/fixtures.mjs),
// reloads so the app's own lazy migrations run, then drives the real UI and records:
//   - screenshots of the plan and comparison viewers,
//   - the user-space box of every text element on the overlay, under the app's RTL page AND with the
//     page forced to dir="ltr" (a saved note must not move when the surrounding UI direction changes),
//   - the real Hebrew exports: plan Excel + PDF, plan-page PDF, project Excel + PDF, comparison PDF,
//   - the saved records as they stand at the end of the session,
//   - a UI text tour: every visible string, title, aria-label, placeholder and <option> on each
//     screen, sidebar tab, top-bar menu and dialog it can reach, plus <html lang/dir> and the title.
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
// BC_DIR=ltr runs the whole capture with the dev-only LTR page direction (`?dir=ltr`), to prove the
// exports do not depend on it: compare the result against an RTL capture and only the screenshots
// and the UI-text direction may differ.
const DEV_URL = `http://localhost:${DEV_PORT}${process.env.BC_DIR ? `/?dir=${process.env.BC_DIR}` : ''}`;
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
  const pageDir = await page.evaluate(() => document.documentElement.dir);
  await page.evaluate(() => document.documentElement.setAttribute('dir', 'ltr'));
  await pause(400);
  results[`${name}-ltr`] = await overlayTexts(page);
  await page.evaluate((dir) => document.documentElement.setAttribute('dir', dir), pageDir);
  await pause(400);
}

/** Everything a user can read on the current screen, including tooltips and accessible names. */
async function uiText(page) {
  return page.evaluate(() => {
    const attrs = [];
    for (const el of document.querySelectorAll('[title],[aria-label],[placeholder],[alt]'))
      for (const a of ['title', 'aria-label', 'placeholder', 'alt']) {
        const v = el.getAttribute(a);
        if (v) attrs.push(`${a}=${v}`);
      }
    return {
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      title: document.title,
      text: document.body.innerText.split('\n').map((l) => l.trim()).filter(Boolean),
      attrs,
      options: Array.from(document.querySelectorAll('option')).map((o) => o.textContent),
    };
  });
}

/**
 * Runs one step of the UI tour and records the text it shows. Best effort: a step that cannot be
 * reached is recorded as such (and fails the comparison only if the other capture reached it).
 */
async function tourStep(page, results, name, action) {
  results.uiText ??= {};
  try {
    if (action) await action();
    await pause(300);
    results.uiText[name] = await uiText(page);
  } catch (err) {
    results.uiText[name] = { unreachable: String(err).split('\n')[0] };
  }
}

/** Opens each top-bar menu in turn and records it. */
async function tourMenus(page, results, prefix) {
  const count = await page.locator('.top-bar-menu-btn').count();
  for (let i = 0; i < count; i++) {
    const btn = page.locator('.top-bar-menu-btn').nth(i);
    await tourStep(page, results, `${prefix}-menu-${i}`, () => btn.click({ timeout: 3000 }));
    await btn.click({ timeout: 3000 }).catch(() => {});
  }
}

const quick = { timeout: 3000 };

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
    await page.locator('.saved-list li').first().waitFor();
    await tourStep(page, results, 'home');
    await tourStep(page, results, 'home-new-project', () => page.getByRole('button', { name: 'פרויקט חדש' }).click(quick));
    await page.locator('.modal').getByRole('button', { name: 'ביטול' }).click(quick).catch(() => {});

    // ---- Quantity takeoff: the legacy plan, wrapped into a project on load ----
    console.log('plan');
    await page.locator('.saved-list li', { hasText: 'פרויקט רגרסיה' }).click();
    await page.locator('li[title="פתח את התוכנית"]').first().waitFor();
    await tourStep(page, results, 'overview');
    await tourStep(page, results, 'overview-summary-row', () => page.locator('.project-summary-row').first().click(quick));
    await tourStep(page, results, 'overview-add-plan', () => page.getByRole('button', { name: 'תוכנית חדשה' }).click(quick));
    await page.locator('.modal').getByRole('button', { name: 'ביטול' }).click(quick).catch(() => {});
    await tourStep(page, results, 'overview-add-comparison', () => page.getByRole('button', { name: 'השוואה חדשה' }).click(quick));
    await page.locator('.modal').getByRole('button', { name: 'ביטול' }).click(quick).catch(() => {});
    await page.locator('li[title="פתח את התוכנית"]').first().click();
    await waitForPlanRender(page);
    await captureViewer(page, 'plan', results);

    await tourStep(page, results, 'plan');
    await tourStep(page, results, 'plan-room-selected', () => page.locator('.room-list li', { hasText: 'סלון' }).first().click(quick));
    await tourStep(page, results, 'plan-tab-measure', () => page.locator('.sidebar-tabs button', { hasText: 'מדידות' }).click(quick));
    await tourStep(page, results, 'plan-tab-markup', () => page.locator('.sidebar-tabs button', { hasText: 'סימונים' }).click(quick));
    await page.locator('.sidebar-tabs button', { hasText: 'חדרים ודירות' }).click(quick).catch(() => {});
    await tourStep(page, results, 'plan-quantities', () => page.getByTitle('פתח את טבלת הכמויות').click(quick));
    await tourStep(page, results, 'plan-quantities-defaults', () => page.getByTitle('ברירות המחדל שמהן נגזרים הפחת והגבהים של פריטי עבודה חדשים').click(quick));
    await page.getByTitle('סגור את חלונית הכמויות').click(quick).catch(() => {});
    await tourMenus(page, results, 'plan');
    await tourStep(page, results, 'plan-tool-calibrate', () => page.getByRole('button', { name: 'כיול קנה מידה' }).click(quick));
    await tourStep(page, results, 'plan-tool-draw', () => page.locator('.toolbar').getByRole('button', { name: 'סימון חדר' }).click(quick));
    await page.locator('.toolbar').getByRole('button', { name: 'בחירה' }).click(quick).catch(() => {});

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
    await tourStep(page, results, 'compare');
    await tourStep(page, results, 'compare-tab-measure', () => page.locator('.sidebar-tabs button', { hasText: 'כיול ומדידה' }).click(quick));
    await tourStep(page, results, 'compare-tab-markup', () => page.locator('.sidebar-tabs button', { hasText: 'סימונים' }).click(quick));
    await page.locator('.sidebar-tabs button', { hasText: 'שכבות ויישור' }).click(quick).catch(() => {});
    await tourMenus(page, results, 'compare');
    await tourStep(page, results, 'compare-tool-align', () => page.locator('button[aria-label="יישור"]').click(quick));
    await page.getByRole('button', { name: 'בחירה', exact: true }).first().click(quick).catch(() => {});
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
