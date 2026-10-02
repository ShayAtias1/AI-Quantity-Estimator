// Screenshots of the main surfaces right after switching language in place (no reload), both directions,
// with Hebrew-named content (legacy fixture) and English-named content (stress fixture) seeded, plus a
// scroll-overflow check per shot.   node demo/regression/lang-visual.mjs → demo/output/lang-visual/
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { LEGACY_COMPARISON, LEGACY_PLAN } from './fixtures.mjs';
import { STRESS_PLAN_1, STRESS_PROJECT } from './stress-fixtures.mjs';
import { he } from '../../src/i18n/he.ts';
import { en } from '../../src/i18n/en.ts';

const D = { he, en };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'demo', 'output', 'lang-visual');
const PORT = 5191;
const URL_ = `http://localhost:${PORT}/`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const quick = { timeout: 5000 };

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
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
    const page = await (await browser.newContext({ viewport: { width: 1500, height: 900 } })).newPage();
    page.on('dialog', (d) => void d.dismiss());
    await page.goto(URL_);
    await page.getByRole('button', { name: he.startScreen.newProject }).waitFor();
    const b64 = async (f) => (await readFile(path.join(ROOT, 'demo', 'assets', f))).toString('base64');
    const [a, r] = await Promise.all([b64('BetterCalc_Demo_Apartment_A_Floor_Plan.pdf'), b64('BetterCalc_Demo_Apartment_A_Revision_B.pdf')]);
    await page.evaluate(
      async ({ legacy, stress, a, r }) => {
        const blob = (s) => new Blob([Uint8Array.from(atob(s), (c) => c.charCodeAt(0))], { type: 'application/pdf' });
        const db = await new Promise((res, rej) => {
          const q = indexedDB.open('bettercalc-qto', 3);
          q.onsuccess = () => res(q.result);
          q.onerror = () => rej(q.error);
        });
        const tx = db.transaction(['projects', 'pdfFiles', 'takeoffProjects', 'comparisons', 'comparePdfFiles'], 'readwrite');
        tx.objectStore('projects').put(legacy.plan);
        tx.objectStore('pdfFiles').put(blob(a), legacy.plan.id);
        tx.objectStore('comparisons').put(legacy.comparison);
        tx.objectStore('comparePdfFiles').put(blob(a), `${legacy.comparison.id}:original`);
        tx.objectStore('comparePdfFiles').put(blob(r), `${legacy.comparison.id}:revised`);
        tx.objectStore('projects').put({ ...stress.plan, projectId: stress.project.id });
        tx.objectStore('pdfFiles').put(blob(a), stress.plan.id);
        tx.objectStore('takeoffProjects').put({ ...stress.project, planIds: [stress.plan.id], comparisonIds: [] });
        await new Promise((res, rej) => {
          tx.oncomplete = res;
          tx.onerror = () => rej(tx.error);
        });
        db.close();
      },
      { legacy: { plan: LEGACY_PLAN, comparison: LEGACY_COMPARISON }, stress: { plan: { ...STRESS_PLAN_1, pages: { 1: STRESS_PLAN_1.pages[1] }, rooms: STRESS_PLAN_1.rooms.filter((x) => x.pageNumber === 1).slice(0, 12), measurements: [] }, project: STRESS_PROJECT }, a, r }
    );
    await page.reload();
    await page.locator('.saved-list li').first().waitFor();
    const ready = async () => {
      await page.locator('.pdf-viewport canvas').first().waitFor({ state: 'visible', timeout: 20_000 });
      await pause(2500);
    };
    const press = (to) => page.locator('.language-switch button', { hasText: to === 'en' ? 'English' : 'עברית' }).click(quick);
    const shot = async (name) => {
      await pause(500);
      const overflow = await page.evaluate(() => ({ x: document.documentElement.scrollWidth > document.documentElement.clientWidth, y: document.documentElement.scrollHeight > document.documentElement.clientHeight }));
      console.log(`${name}: page scroll overflow x=${overflow.x} y=${overflow.y}`);
      await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    };
    const setLang = async (l) => {
      await page.evaluate((x) => localStorage.setItem('bettercalc.uiLanguage', x), l);
      await page.reload();
      await page.locator('.saved-list li').first().waitFor();
    };

    for (const [from, to] of [['he', 'en'], ['en', 'he']]) {
      const L = D[from];
      await setLang(from);
      await press(from); // no-op press of the already-active option
      await press(to);
      await shot(`${from}-${to}-home`);
      await press(from);
      // Hebrew-named project in the English UI is the realistic mixed case; English-named in Hebrew UI the other.
      const projectName = from === 'he' ? 'פרויקט רגרסיה' : 'Riverside';
      await page.locator('.saved-list li', { hasText: projectName }).click();
      await page.locator(`li[title="${L.projectOverview.openPlan}"]`).first().waitFor();
      await press(to);
      await shot(`${from}-${to}-overview`);
      await press(from);
      await page.locator(`li[title="${L.projectOverview.openPlan}"]`).first().click();
      await ready();
      await page.locator('.room-list li').first().click(quick);
      await press(to);
      await shot(`${from}-${to}-plan-room`);
      await page.getByTitle(D[to].quantitiesPanel.open).click(quick);
      await shot(`${from}-${to}-plan-quantities`);
      await page.getByTitle(D[to].quantitiesPanel.close).click(quick).catch(() => {});
      await page.locator('.top-bar-menu-btn', { hasText: D[to].common.export }).click(quick);
      await shot(`${from}-${to}-export-menu`);
      await page.keyboard.press('Escape');
      await page.getByTitle(D[to].topBar.backToOverview).first().click(quick);
      await page.getByTitle(D[to].projectOverview.backToProjects).click(quick);
    }
    // compare, both ways (legacy fixture: Hebrew names)
    for (const [from, to] of [['he', 'en'], ['en', 'he']]) {
      const L = D[from];
      await setLang(from);
      await page.locator('.saved-list li', { hasText: 'השוואת רגרסיה' }).click();
      await page.locator(`li[title="${L.projectOverview.openComparison}"]`).first().click();
      await ready();
      await press(to);
      await shot(`${from}-${to}-compare`);
      await page.locator('.top-bar-menu-btn', { hasText: D[to].common.export }).click(quick);
      await shot(`${from}-${to}-compare-export-menu`);
    }
  } finally {
    await browser?.close();
    server.kill();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
