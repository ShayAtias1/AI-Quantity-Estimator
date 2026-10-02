// Runtime language switching, checked against the real app (no reload on the switch itself).
// For each screen and each direction (he→en, en→he):
//   switched: load in the FROM language, reach the screen, press the selector, read everything visible;
//   fresh:    load in the TO language, reach the same screen, read the same;
// and the two must be identical — any difference is stale text, stale direction or a stale title.
// Also checks, across a switch: <html lang/dir>/title, the plan raster pixels, overlay text count, and
// that the saved records are untouched; and that the choice persists across a reload.
//   node demo/regression/lang-switch.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { LEGACY_COMPARISON, LEGACY_PLAN } from './fixtures.mjs';
import { he } from '../../src/i18n/he.ts';
import { en } from '../../src/i18n/en.ts';

const D = { he, en };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 5189;
const URL_ = `http://localhost:${PORT}/`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const quick = { timeout: 5000 };
let failures = 0;
const check = (ok, what, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? ` — ${detail}` : ''}`);
};

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(URL_)).status < 500) return;
    } catch {}
    await pause(300);
  }
  throw new Error('dev server did not start');
}

async function seed(page) {
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
}

const dump = (page) =>
  page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const q = indexedDB.open('bettercalc-qto', 3);
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
    const out = {};
    for (const s of ['projects', 'takeoffProjects', 'comparisons'])
      out[s] = await new Promise((res, rej) => {
        const q = db.transaction(s).objectStore(s).getAll();
        q.onsuccess = () => res(q.result);
        q.onerror = () => rej(q.error);
      });
    db.close();
    return JSON.stringify(out);
  });

const uiText = (page) =>
  page.evaluate(() => {
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

const planReady = async (page) => {
  await page.locator('.pdf-viewport canvas').first().waitFor({ state: 'visible', timeout: 20_000 });
  await pause(2500);
};
const canvasHash = (page) =>
  page.evaluate(() => {
    const c = document.querySelector('.pdf-viewport canvas');
    return c ? `${c.width}x${c.height}:${c.toDataURL().length}:${c.toDataURL().slice(-200)}` : null;
  });
const overlayCount = (page) => page.evaluate(() => document.querySelectorAll('.pdf-viewport .overlay-svg text').length);

// Each screen: how to reach it from the home screen, in language L.
const openProject = (p) => p.locator('.saved-list li', { hasText: 'פרויקט רגרסיה' }).click();
const openPlan = async (p, L) => {
  await openProject(p, L);
  await p.locator(`li[title="${L.projectOverview.openPlan}"]`).first().click();
  await planReady(p);
};
const openCompare = async (p, L) => {
  await p.locator('.saved-list li', { hasText: 'השוואת רגרסיה' }).click();
  await p.locator(`li[title="${L.projectOverview.openComparison}"]`).first().click();
  await planReady(p);
};
const SCREENS = {
  home: async () => {},
  'home-new-project': (p, L) => p.getByRole('button', { name: L.startScreen.newProject }).click(),
  overview: async (p, L) => {
    await openProject(p, L);
    await p.locator(`li[title="${L.projectOverview.openPlan}"]`).first().waitFor();
  },
  'overview-new-plan': async (p, L) => {
    await SCREENS.overview(p, L);
    await p.getByRole('button', { name: L.projectOverview.newPlan }).click(quick);
  },
  plan: openPlan,
  'plan-room': async (p, L) => {
    await openPlan(p, L);
    await p.locator('.room-list li', { hasText: 'סלון' }).first().click(quick);
  },
  'plan-measure-tab': async (p, L) => {
    await openPlan(p, L);
    await p.locator('.sidebar-tabs button', { hasText: L.workspace.tabs.measure }).click(quick);
  },
  'plan-quantities': async (p, L) => {
    await openPlan(p, L);
    await p.getByTitle(L.quantitiesPanel.open).click(quick);
  },
  'plan-export-menu': async (p, L) => {
    await openPlan(p, L);
    await p.locator('.top-bar-menu-btn', { hasText: L.common.export }).click(quick);
  },
  'plan-view-menu': async (p, L) => {
    await openPlan(p, L);
    await p.locator('.top-bar-menu-btn', { hasText: L.topBar.view }).click(quick);
  },
  compare: openCompare,
  'compare-measure-tab': async (p, L) => {
    await openCompare(p, L);
    await p.locator('.sidebar-tabs button', { hasText: L.compare.tabs.measure }).click(quick);
  },
  'compare-export-menu': async (p, L) => {
    await openCompare(p, L);
    await p.locator('.top-bar-menu-btn', { hasText: L.common.export }).click(quick);
  },
};

async function main() {
  const server = spawn('npm', ['run', 'dev', '--', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('dialog', (d) => void d.dismiss());

    await page.goto(URL_);
    await page.getByRole('button', { name: he.startScreen.newProject }).waitFor();
    check(await page.evaluate(() => localStorage.getItem('bettercalc.uiLanguage')) === null, 'first visit: nothing saved');
    const first = await uiText(page);
    check(first.lang === 'he' && first.dir === 'rtl', 'first visit opens in Hebrew / RTL (default, no detection)');
    await seed(page);

    const load = async (lang) => {
      await page.evaluate((l) => localStorage.setItem('bettercalc.uiLanguage', l), lang);
      await page.reload();
      await page.locator('.saved-list li').first().waitFor();
      await pause(300);
    };
    // A modal's backdrop covers the top bar, so with a dialog open the control cannot be reached by a user;
    // the click is dispatched straight to it so that the open dialog's own text is still checked.
    const press = (to) => page.locator('.language-switch button', { hasText: to === 'en' ? 'English' : 'עברית' }).evaluate((el) => el.click());

    for (const [from, to] of [['he', 'en'], ['en', 'he']]) {
      console.log(`\n== ${from} → ${to}`);
      for (const [name, reach] of Object.entries(SCREENS)) {
        await load(from);
        await reach(page, D[from]);
        await pause(500);
        const rasterBefore = await canvasHash(page);
        const overlaysBefore = await overlayCount(page);
        const dbBefore = await dump(page);
        await press(to);
        await pause(700);
        const switched = await uiText(page);
        const rasterAfter = await canvasHash(page);
        const overlaysAfter = await overlayCount(page);
        const dbAfter = await dump(page);

        await load(to);
        await reach(page, D[to]);
        await pause(500);
        const fresh = await uiText(page);
        const diff = (k) => {
          const a = switched[k], b = fresh[k];
          return Array.isArray(a) ? [...a.filter((x) => !b.includes(x)).map((x) => `switched-only: ${x}`), ...b.filter((x) => !a.includes(x)).map((x) => `fresh-only: ${x}`)] : a === b ? [] : [`${a} ≠ ${b}`];
        };
        const problems = ['lang', 'dir', 'title', 'text', 'attrs', 'options'].flatMap((k) => diff(k).map((d) => `${k}: ${d}`));
        check(problems.length === 0, `${name}: switching ${from}→${to} in place equals a fresh ${to} load`, problems.slice(0, 4).join(' | '));
        check(switched.lang === to && switched.dir === (to === 'he' ? 'rtl' : 'ltr'), `${name}: <html lang/dir> follow`, `${switched.lang}/${switched.dir}`);
        check(dbBefore === dbAfter, `${name}: saved records untouched by the switch`);
        if (rasterBefore) {
          check(rasterBefore === rasterAfter, `${name}: plan raster unchanged by the switch`);
          check(overlaysBefore === overlaysAfter, `${name}: overlay text count unchanged`, `${overlaysBefore}`);
        }
      }
    }

    // ---- persistence: switch, reload, still switched; switch back, reload ----
    console.log('\n== persistence');
    await page.evaluate(() => localStorage.removeItem('bettercalc.uiLanguage'));
    await page.reload();
    await page.locator('.saved-list li').first().waitFor();
    check((await uiText(page)).lang === 'he', 'no saved preference → Hebrew');
    await press('en');
    await pause(300);
    let s = await uiText(page);
    check(s.lang === 'en' && s.dir === 'ltr', 'switch to English: lang=en dir=ltr immediately');
    check((await page.evaluate(() => localStorage.getItem('bettercalc.uiLanguage'))) === 'en', 'saved as bettercalc.uiLanguage=en');
    await page.reload();
    await page.locator('.saved-list li').first().waitFor();
    s = await uiText(page);
    check(s.lang === 'en' && s.dir === 'ltr', 'reload: English remains');
    await press('he');
    await pause(300);
    s = await uiText(page);
    check(s.lang === 'he' && s.dir === 'rtl', 'switch back: lang=he dir=rtl immediately');
    await page.reload();
    await page.locator('.saved-list li').first().waitFor();
    s = await uiText(page);
    check(s.lang === 'he' && s.dir === 'rtl', 'reload: Hebrew remains');
    const stored = await dump(page);
    check(!/uiLanguage|"language"/.test(stored), 'no language stored in any project/plan/comparison record');
    check(errors.length === 0, 'no page errors', errors.slice(0, 2).join(' | '));
    console.log(failures ? `\n${failures} FAILED` : '\nall language-switch checks passed');
  } finally {
    await browser?.close();
    server.kill();
  }
}
main().then(() => process.exit(failures ? 1 : 0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
