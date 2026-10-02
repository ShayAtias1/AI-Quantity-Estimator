// Exports across language switches in ONE browser session (no reload, same saved project):
// Hebrew round → switch to English → English round → switch back → Hebrew round. Each round downloads
// the same seven exports into demo/output/regression/<prefix>-he1, -en, -he3; the first and last must
// match each other (compare.mjs --exports-only) and the English one is checked by verify-exports.mjs.
//   node demo/regression/session-exports.mjs <prefix>
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { LEGACY_COMPARISON, LEGACY_PLAN } from './fixtures.mjs';
import { he } from '../../src/i18n/he.ts';
import { en } from '../../src/i18n/en.ts';

const D = { he, en };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const prefix = process.argv[2];
if (!prefix) throw new Error('usage: node demo/regression/session-exports.mjs <prefix>');
const PORT = 5190;
const URL_ = `http://localhost:${PORT}/`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const quick = { timeout: 5000 };

async function main() {
  const server = spawn('npm', ['run', 'dev', '--', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
  let browser;
  try {
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(URL_)).status < 500) break;
      } catch {}
      await pause(300);
    }
    browser = await chromium.launch();
    const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('dialog', (d) => {
      errors.push(`dialog: ${d.message()}`);
      void d.dismiss();
    });
    await page.goto(URL_);
    await page.getByRole('button', { name: he.startScreen.newProject }).waitFor();
    const b64 = async (f) => (await readFile(path.join(ROOT, 'demo', 'assets', f))).toString('base64');
    const [a, r] = await Promise.all([b64('BetterCalc_Demo_Apartment_A_Floor_Plan.pdf'), b64('BetterCalc_Demo_Apartment_A_Revision_B.pdf')]);
    await page.evaluate(
      async ({ plan, comparison, a, r }) => {
        const blob = (s) => new Blob([Uint8Array.from(atob(s), (c) => c.charCodeAt(0))], { type: 'application/pdf' });
        const db = await new Promise((res, rej) => {
          const q = indexedDB.open('bettercalc-qto', 3);
          q.onsuccess = () => res(q.result);
          q.onerror = () => rej(q.error);
        });
        const tx = db.transaction(['projects', 'pdfFiles', 'comparisons', 'comparePdfFiles'], 'readwrite');
        tx.objectStore('projects').put(plan);
        tx.objectStore('pdfFiles').put(blob(a), plan.id);
        tx.objectStore('comparisons').put(comparison);
        tx.objectStore('comparePdfFiles').put(blob(a), `${comparison.id}:original`);
        tx.objectStore('comparePdfFiles').put(blob(r), `${comparison.id}:revised`);
        await new Promise((res, rej) => {
          tx.oncomplete = res;
          tx.onerror = () => rej(tx.error);
        });
        db.close();
      },
      { plan: LEGACY_PLAN, comparison: LEGACY_COMPARISON, a, r }
    );
    await page.reload(); // the only reload: after seeding, before the first export
    await page.locator('.saved-list li').first().waitFor();

    const ready = async () => {
      await page.locator('.pdf-viewport canvas').first().waitFor({ state: 'visible', timeout: 20_000 });
      await pause(2500);
    };
    const press = (to) => page.locator('.language-switch button', { hasText: to === 'en' ? 'English' : 'עברית' }).click(quick);

    /** All exports of one round, in the language the UI is showing. */
    const round = async (lang, label) => {
      const L = D[lang];
      const OUT = path.join(ROOT, 'demo', 'output', 'regression', `${prefix}-${label}`);
      await rm(OUT, { recursive: true, force: true });
      await mkdir(OUT, { recursive: true });
      const download = async (trigger, file) => {
        const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), trigger()]);
        await dl.saveAs(path.join(OUT, file));
      };
      const exportMenu = () => page.locator('.top-bar-menu-btn', { hasText: L.common.export }).click();
      const pageOnly = L.topBar.pageOnly.replace('{page}', '1');
      const toggle = async (name) => {
        await page.locator('.top-bar-menu-btn', { hasText: L.topBar.view }).click(quick);
        await page.locator('.menu-item', { hasText: name }).click(quick);
        await page.keyboard.press('Escape');
      };
      await page.locator('.saved-list li', { hasText: 'פרויקט רגרסיה' }).click();
      await page.locator(`li[title="${L.projectOverview.openPlan}"]`).first().click();
      await ready();
      await download(async () => { await exportMenu(); await page.getByRole('button', { name: L.quantityExport.excelMenu }).click(); }, 'plan.xlsx');
      await download(async () => { await exportMenu(); await page.getByRole('button', { name: L.quantityExport.pdfMenu }).click(); }, 'plan.pdf');
      await download(async () => { await exportMenu(); await page.getByRole('button', { name: pageOnly }).click(); }, 'plan-page.pdf');
      await toggle(L.topBar.annotations);
      await toggle(L.topBar.measurements);
      await download(async () => { await exportMenu(); await page.getByRole('button', { name: pageOnly }).click(); }, 'plan-bare.pdf');
      await toggle(L.topBar.annotations);
      await toggle(L.topBar.measurements);
      await page.getByTitle(L.topBar.backToOverview).first().click();
      await page.locator(`li[title="${L.projectOverview.openPlan}"]`).first().waitFor();
      await download(() => page.getByTitle(L.projectOverview.excelHint).click(), 'project.xlsx');
      await download(() => page.getByTitle(L.projectOverview.pdfHint).click(), 'project.pdf');
      await page.getByTitle(L.projectOverview.backToProjects).click();
      await page.locator('.saved-list li', { hasText: 'השוואת רגרסיה' }).click();
      await page.locator(`li[title="${L.projectOverview.openComparison}"]`).first().click();
      await ready();
      await download(async () => {
        await page.locator('.top-bar-menu-btn', { hasText: L.common.export }).click();
        await page.locator('.menu-item', { hasText: '— מעודכן' }).first().click();
      }, 'compare.pdf');
      console.log(`  ${label}: 7 exports (UI ${await page.evaluate(() => document.documentElement.lang)})`);
    };

    await round('he', 'he1');
    await press('en'); // still inside the comparison
    await pause(500);
    await page.getByTitle(en.topBar.backToOverview).first().click();
    await page.getByTitle(en.projectOverview.backToProjects).click();
    await round('en', 'en');
    await press('he');
    await pause(500);
    await page.getByTitle(he.topBar.backToOverview).first().click();
    await page.getByTitle(he.projectOverview.backToProjects).click();
    await round('he', 'he3');
    console.log(errors.length ? `page errors: ${errors.join(' | ')}` : 'no page errors');
  } finally {
    await browser?.close();
    server.kill();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
