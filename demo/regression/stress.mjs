// Export hardening run: seeds the oversized fixtures (stress-fixtures.mjs) and downloads every export
// that can overflow — plan Excel/PDF (all pages), project Excel/PDF, comparison PDF (all pages x all
// revisions) — in the UI language given by BC_LANG (he | en).
//   BC_LANG=en node demo/regression/stress.mjs <label>   → demo/output/regression/<label>/
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { STRESS_COMPARISON, STRESS_PLAN_1, STRESS_PLAN_2, STRESS_PROJECT } from './stress-fixtures.mjs';
import { he } from '../../src/i18n/he.ts';
import { en } from '../../src/i18n/en.ts';

const lang = process.env.BC_LANG === 'en' ? 'en' : 'he';
const L = lang === 'en' ? en : he;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const label = process.argv[2];
if (!label) throw new Error('usage: BC_LANG=en node demo/regression/stress.mjs <label>');
const OUT = path.join(ROOT, 'demo', 'output', 'regression', label);
const PORT = 5188;
const URL_ = `http://localhost:${PORT}/?lang=${lang}`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const quick = { timeout: 3000 };

/** The demo plan page repeated `pages` times. */
async function repeatedPdf(pages) {
  const src = await PDFDocument.load(await readFile(path.join(ROOT, 'demo', 'assets', 'BetterCalc_Demo_Apartment_A_Floor_Plan.pdf')));
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage((await doc.copyPages(src, [0]))[0]);
  return Buffer.from(await doc.save()).toString('base64');
}

async function waitForServer(url) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).status < 500) return;
    } catch {}
    await pause(300);
  }
  throw new Error('dev server did not start');
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const server = spawn('npm', ['run', 'dev', '--', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
  let browser;
  try {
    await waitForServer(URL_);
    browser = await chromium.launch();
    const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true })).newPage();
    const errors = [];
    globalThis.__page = page;
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('dialog', (d) => {
      errors.push(`dialog: ${d.message()}`);
      void d.dismiss();
    });
    await page.goto(URL_);
    await page.getByRole('button', { name: L.startScreen.newProject }).waitFor();
    const [two, one] = await Promise.all([repeatedPdf(2), repeatedPdf(1)]);
    await page.evaluate(
      async ({ plans, project, comparison, two, one }) => {
        const blob = (b64) => new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'application/pdf' });
        const db = await new Promise((res, rej) => {
          const r = indexedDB.open('bettercalc-qto', 3);
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
        const tx = db.transaction(['projects', 'pdfFiles', 'takeoffProjects', 'comparisons', 'comparePdfFiles'], 'readwrite');
        for (const p of plans) {
          tx.objectStore('projects').put({ ...p, projectId: project.id });
          tx.objectStore('pdfFiles').put(blob(two), p.id);
        }
        tx.objectStore('takeoffProjects').put(project);
        tx.objectStore('comparisons').put(comparison);
        tx.objectStore('comparePdfFiles').put(blob(two), `${comparison.id}:original`);
        comparison.revisions.forEach((r, i) => tx.objectStore('comparePdfFiles').put(blob(i === 2 ? one : two), `${comparison.id}:revision:${r.id}`));
        await new Promise((res, rej) => {
          tx.oncomplete = res;
          tx.onerror = () => rej(tx.error);
        });
        db.close();
      },
      { plans: [STRESS_PLAN_1, STRESS_PLAN_2], project: STRESS_PROJECT, comparison: STRESS_COMPARISON, two, one }
    );
    await page.reload();

    const download = async (trigger, file) => {
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), trigger()]);
      await dl.saveAs(path.join(OUT, file));
      console.log(`  saved ${file} (${dl.suggestedFilename()})`);
    };
    await page.locator('.saved-list li').first().waitFor();
    await page.locator('.saved-list li', { hasText: 'Riverside' }).click();
    await page.locator(`li[title="${L.projectOverview.openPlan}"]`).first().waitFor();

    // ---- project exports (many plans x rooms x categories) ----
    await download(() => page.getByTitle(L.projectOverview.excelHint).click(), 'project.xlsx');
    await download(() => page.getByTitle(L.projectOverview.pdfHint).click(), 'project.pdf');

    // ---- plan 1: Excel and PDF over both pages ----
    await page.locator(`li[title="${L.projectOverview.openPlan}"]`).first().click();
    await page.locator('.pdf-viewport canvas').first().waitFor({ state: 'visible', timeout: 30_000 });
    await pause(3000);
    // The top-bar menu variant of the export buttons loses its page dialog when the menu closes (a bug
    // that predates this work), so the multi-page dialogs are driven from the Quantities panel.
    await page.getByTitle(L.quantitiesPanel.open).click();
    await download(async () => {
      await page.getByRole('button', { name: L.quantityExport.excelButton }).click();
      await page.locator('.modal input[type=radio]').nth(1).check();
      await page.locator('.modal .btn-primary').click();
    }, 'plan.xlsx');
    await download(async () => {
      await page.getByRole('button', { name: L.quantityExport.pdfButton }).click();
      for (const box of await page.locator('.modal input[type=checkbox]').all()) await box.check();
      await page.locator('.modal .btn-primary').click();
    }, 'plan.pdf');
    await page.getByTitle(L.quantitiesPanel.close).click(quick).catch(() => {});

    // ---- comparison: all pages x all revisions ----
    await page.getByTitle(L.topBar.backToOverview).first().click();
    await page.getByTitle(L.projectOverview.backToProjects).click();
    await page.locator('.saved-list li', { hasText: 'Riverside' }).click();
    await page.locator(`li[title="${L.projectOverview.openComparison}"]`).first().click();
    await page.locator('.pdf-viewport canvas').first().waitFor({ state: 'visible', timeout: 30_000 });
    await pause(3000);
    await download(async () => {
      await page.locator('.top-bar-menu-btn', { hasText: L.common.export }).click();
      await page.locator('.menu-item', { hasText: L.compare.topBar.allPagesCount.replace('{count}', '2') }).first().click();
      await page.locator('.menu-item', { hasText: L.compare.topBar.allRevisions.replace('{count}', '3') }).click();
    }, 'compare.pdf');

    await writeFile(path.join(OUT, 'errors.json'), JSON.stringify(errors, null, 2));
    console.log(`done → ${path.relative(ROOT, OUT)}; ${errors.length} page error/dialog(s)`);
    errors.forEach((e) => console.log('  !', e.slice(0, 200)));
  } catch (e) {
    await globalThis.__page?.screenshot({ path: path.join(OUT, 'failure.png') }).catch(() => {});
    throw e;
  } finally {
    await browser?.close();
    server.kill();
  }
}
main().catch(async (e) => {
  await globalThis.__page?.screenshot({ path: path.join(OUT, 'failure.png') }).catch(() => {});
  console.error(e);
  process.exitCode = 1;
});
