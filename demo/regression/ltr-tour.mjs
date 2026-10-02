// LTR / English tour: drives the real app in normal Hebrew RTL and in a second mode, visits the
// important screens, and reports layout failures.
//
//   node demo/regression/ltr-tour.mjs            Hebrew forced to LTR (`?dir=ltr`) — direction safety
//   node demo/regression/ltr-tour.mjs en         the English UI (`?lang=en` → lang="en" dir="ltr")
//
// Both overrides are dev-only (see src/main.tsx). Selectors come from the dictionaries (he.ts / en.ts),
// so the same steps run in either language. In English mode it also fails on any Hebrew that is not
// the demo data's own (names, notes) — in the page text, tooltips, aria-labels, placeholders, options
// and native dialogs.
//
// Per screen it checks: <html lang/dir>, no horizontal page overflow, controls / panels / dialogs
// inside the viewport, no clipped text (excluding deliberate ellipsis), and the previous/next
// page-nav order. Across the whole run it checks that the plan overlay's stored geometry (the box of
// every <text> in plan space) is identical in RTL and LTR, and that no page errors occurred.
//
// Issues that also occur in RTL are pre-existing and reported as such; only LTR-only issues fail.
// This is not a pixel comparison: LTR screenshots go to demo/output/ltr/ for manual review.
//
// Run: node demo/regression/ltr-tour.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { LEGACY_COMPARISON, LEGACY_PLAN } from './fixtures.mjs';
import { he } from '../../src/i18n/he.ts';
import { en } from '../../src/i18n/en.ts';

const MODE = process.argv[2] === 'en' ? 'en' : 'ltr-he';
const T = MODE === 'en' ? en : he; // dictionary of the language under test
const H = he; // the baseline run is always Hebrew

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'demo', 'output', MODE === 'en' ? 'en' : 'ltr');
const ORIGINAL_PDF = path.join(ROOT, 'demo', 'assets', 'BetterCalc_Demo_Apartment_A_Floor_Plan.pdf');
const REVISION_PDF = path.join(ROOT, 'demo', 'assets', 'BetterCalc_Demo_Apartment_A_Revision_B.pdf');
const DEV_PORT = MODE === 'en' ? 5189 : 5188;
const DEV_URL = `http://localhost:${DEV_PORT}`;
const VIEWPORT = { width: 1600, height: 1000 };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const quick = { timeout: 3000 };

async function waitForServer(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return;
    } catch {
      // not up yet
    }
    await pause(300);
  }
  throw new Error(`Dev server did not respond at ${url}`);
}

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

async function waitForPlanRender(page) {
  await page.locator('.pdf-viewport canvas').first().waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForFunction(() => {
    const c = document.querySelector('.pdf-viewport canvas');
    return !!c && c.width > 0 && c.getBoundingClientRect().width > 0;
  });
  await pause(2500);
}

async function overlayTexts(page) {
  await page.evaluate(() => document.fonts.ready); // text boxes are measured with the final fonts
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.pdf-viewport .overlay-svg text')).map((t) => {
      const b = t.getBBox();
      const r = (v) => Math.round(v * 100) / 100;
      return { text: t.textContent, x: r(b.x), y: r(b.y), width: r(b.width), height: r(b.height) };
    })
  );
}

/** Hash of the pixels of every plan canvas (the imported PDF's own raster) — must not depend on the UI language. */
async function canvasHashes(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.pdf-viewport canvas')).map((c) => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let h = 2166136261;
      for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619);
      return `${c.width}x${c.height}:${(h >>> 0).toString(16)}`;
    })
  );
}

/** Runs in the page: returns the layout problems visible on the current screen. */
function inspectLayout() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const problems = [];
  const describe = (el) => {
    const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).join('.')}` : '';
    const label = (el.getAttribute('title') || el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30);
    return `${el.tagName.toLowerCase()}${cls}${label ? ` "${label}"` : ''}`;
  };
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  // The plan canvas and its overlay are spatial: they are meant to be panned past the viewport.
  const inPlan = (el) => !!el.closest('.pdf-content');

  if (document.documentElement.scrollWidth > vw + 1) problems.push(`page scrolls horizontally (${document.documentElement.scrollWidth} > ${vw})`);

  const controls = 'button, input, select, textarea, .modal, .top-bar-menu, .sidebar, .quantities-panel, [role=dialog]';
  for (const el of document.querySelectorAll(controls)) {
    if (!visible(el) || inPlan(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.left < -1 || r.right > vw + 1 || r.top < -1 || r.bottom > vh + 1) {
      // A control inside a scroll container that is itself on screen is reachable by scrolling.
      let scrolls = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (/(auto|scroll)/.test(s.overflowX + s.overflowY)) {
          const pr = p.getBoundingClientRect();
          if (pr.left >= -1 && pr.right <= vw + 1) scrolls = true;
          break;
        }
      }
      if (!scrolls) problems.push(`outside viewport: ${describe(el)} [${Math.round(r.left)}..${Math.round(r.right)}, ${Math.round(r.top)}..${Math.round(r.bottom)}]`);
    }
  }

  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || inPlan(el)) continue;
    if (!Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const s = getComputedStyle(el);
    if (s.textOverflow === 'ellipsis') continue; // deliberate truncation
    if (el.scrollWidth > el.clientWidth + 1 && s.overflowX !== 'visible' && el.clientWidth > 0)
      problems.push(`text clipped: ${describe(el)} (${el.scrollWidth} > ${el.clientWidth})`);
  }

  // Two visible controls must not sit on top of each other.
  const buttons = Array.from(document.querySelectorAll('button, input, select')).filter((e) => visible(e) && !inPlan(e));
  for (let i = 0; i < buttons.length; i++)
    for (let j = i + 1; j < buttons.length; j++) {
      const a = buttons[i], b = buttons[j];
      if (a.contains(b) || b.contains(a)) continue;
      if (a.closest('.top-bar-menu, .modal') !== b.closest('.top-bar-menu, .modal')) continue; // menus and dialogs float over the page on purpose
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (w > 4 && h > 4 && w * h > 0.3 * Math.min(ra.width * ra.height, rb.width * rb.height)) problems.push(`controls overlap: ${describe(a)} / ${describe(b)}`);
    }

  const nav = document.querySelector('.page-nav');
  const info = { dir: document.documentElement.dir, lang: document.documentElement.lang };
  if (nav) {
    const [prev, next] = Array.from(nav.querySelectorAll('button'));
    if (prev && next) {
      const prevLeftOfNext = prev.getBoundingClientRect().left < next.getBoundingClientRect().left;
      info.pageNav = prevLeftOfNext ? 'previous-left' : 'previous-right';
      const tip = (btn) => (new DOMMatrix(getComputedStyle(btn.querySelector('svg')).transform).a < 0 ? 'mirrored' : 'drawn');
      info.chevrons = `${tip(prev)}/${tip(next)}`;
    }
  }
  const crumb = document.querySelector('.breadcrumb-project + svg');
  if (crumb) info.breadcrumbChevron = new DOMMatrix(getComputedStyle(crumb).transform).a < 0 ? 'mirrored' : 'drawn';
  const texts = document.body.innerText.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const el of document.querySelectorAll('[title],[aria-label],[placeholder],[alt]'))
    for (const a of ['title', 'aria-label', 'placeholder', 'alt']) if (el.getAttribute(a)) texts.push(el.getAttribute(a));
  for (const o of document.querySelectorAll('option')) texts.push(o.textContent);
  texts.push(document.title);
  return { problems, info, texts };
}

/** Hebrew words that belong to the demo data (names, notes, file names), not to the interface. */
const DEMO_WORDS = new Set([
  ...(JSON.stringify([LEGACY_PLAN, LEGACY_COMPARISON]).match(/[\u0590-\u05FF]+/g) ?? []),
  // The revision label the comparison migration gives a legacy comparison — stored data, kept as is.
  'מעודכן',
]);
// innerText joins the lines of a multi-line note without a separator, so a run may be several words.
const DEMO_TEXT = [...DEMO_WORDS].join('');
/** The language selector writes each language's own name, so Hebrew's is meant to be there in the English UI. */
const LANGUAGE_NAME = 'עברית';
/** Interface Hebrew left in a list of visible strings. */
const interfaceHebrew = (texts) =>
  [...new Set(texts.filter((t) => t !== LANGUAGE_NAME).filter((t) => (t.match(/[\u0590-\u05FF]+/g) ?? []).some((w) => !DEMO_WORDS.has(w) && !DEMO_TEXT.includes(w))))];

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const devServer = spawn('npm', ['run', 'dev', '--', '--port', String(DEV_PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
  devServer.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
  let browser;
  const report = { base: {}, target: {}, overlay: {}, rasters: {}, dialogs: [], notCovered: [], errors: [] };
  let expectDialog = false;
  try {
    await waitForServer(DEV_URL, 30_000);
    browser = await chromium.launch();
    // Pass 1 is the Hebrew RTL baseline (what production shows); pass 2 is the mode under test.
    for (const pass of ['base', 'target']) {
      const L = pass === 'base' ? H : T;
      // A fresh browser context per pass: the first pass must not leave data behind for the second.
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      const page = await context.newPage();
      page.on('pageerror', (e) => report.errors.push(String(e)));
      page.on('console', (m) => m.type() === 'error' && report.errors.push(m.text()));
      page.on('dialog', (d) => {
        if (expectDialog) {
          if (pass === 'target') report.dialogs.push({ type: d.type(), message: d.message() });
        } else report.errors.push(`dialog: ${d.message()}`);
        void d.dismiss();
      });
      await page.goto(DEV_URL);
      await page.getByRole('button', { name: H.startScreen.newProject }).waitFor();
      await seed(page);

      const results = (report[pass] = {});
      const check = async (name, action, { optional = false } = {}) => {
        try {
          if (action) await action();
          await pause(350);
          results[name] = await page.evaluate(inspectLayout);
          if (pass === 'target') await page.screenshot({ path: path.join(OUT, `${name}.png`) });
        } catch (err) {
          results[name] = { unreachable: String(err).split('\n')[0] };
          if (optional) {
            results[name].optional = true;
            if (pass === 'target') report.notCovered.push(`${name}: ${results[name].unreachable}`);
          }
        }
      };
      const closeModal = () => page.locator('.modal').getByRole('button', { name: L.common.cancel }).click(quick).catch(() => {});
      const tab = (key) => page.locator('.sidebar-tabs button', { hasText: L.workspace.tabs[key] });
      const cmpTab = (key) => page.locator('.sidebar-tabs button', { hasText: L.compare.tabs[key] });
      const planBox = async () => (await page.locator('.pdf-viewport').boundingBox());

      const url = pass === 'base' ? DEV_URL : MODE === 'en' ? `${DEV_URL}/?lang=en` : `${DEV_URL}/?dir=ltr`;
      await page.goto(url);
      await page.locator('.saved-list li').first().waitFor();
      await check('home');
      await check('home-new-project', () => page.getByRole('button', { name: L.startScreen.newProject }).click(quick));
      await closeModal();

      await page.locator('.saved-list li', { hasText: 'פרויקט רגרסיה' }).click();
      await page.locator(`li[title="${L.projectOverview.openPlan}"]`).first().waitFor();
      await check('overview');
      await check('overview-summary-row', () => page.locator('.project-summary-row').first().click(quick));
      await check('overview-add-plan', () => page.getByRole('button', { name: L.projectOverview.newPlan }).click(quick));
      await closeModal();
      await check('overview-add-comparison', () => page.getByRole('button', { name: L.projectOverview.newComparison }).click(quick));
      await closeModal();

      await page.locator(`li[title="${L.projectOverview.openPlan}"]`).first().click();
      await waitForPlanRender(page);
      report.overlay[`plan-${pass}`] = await overlayTexts(page);
      report.rasters[`plan-${pass}`] = await canvasHashes(page);
      await check('plan');
      await check('plan-room-selected', () => page.locator('.room-list li', { hasText: 'סלון' }).first().click(quick));
      await check('plan-tab-measure', () => tab('measure').click(quick));
      await check('plan-tab-markup', () => tab('markup').click(quick));
      await tab('rooms').click(quick).catch(() => {});
      await check('plan-quantities', () => page.getByTitle(L.quantitiesPanel.open).click(quick));
      await check('plan-quantities-defaults', () => page.getByTitle(L.quantitiesPanel.defaultsHint).click(quick));
      await page.getByTitle(L.quantitiesPanel.close).click(quick).catch(() => {});
      const planMenus = await page.locator('.top-bar-menu-btn').count();
      for (let i = 0; i < planMenus; i++) {
        const btn = page.locator('.top-bar-menu-btn').nth(i);
        await check(`plan-menu-${i}`, () => btn.click(quick));
        await btn.click(quick).catch(() => {});
      }
      await check('plan-tool-calibrate', () => page.getByRole('button', { name: L.toolbar.calibrate }).click(quick));
      // Two clicks on the plan open the calibration dialog.
      await check(
        'plan-calibration-dialog',
        async () => {
          const box = await planBox();
          await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5);
          await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
          await page.locator('.calibration-modal').waitFor({ timeout: 3000 });
        },
        { optional: true }
      );
      await closeModal();
      await check('plan-tool-draw', () => page.locator('.toolbar').getByRole('button', { name: L.toolbar.draw }).click(quick));
      await page.locator('.toolbar').getByRole('button', { name: L.toolbar.select }).click(quick).catch(() => {});
      await check(
        'plan-text-note-dialog',
        async () => {
          await tab('markup').click(quick);
          await page.locator('.sidebar').getByRole('button', { name: L.markupTools.text }).first().click(quick);
          const box = await planBox();
          await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.6);
          await page.locator('.text-note-modal').waitFor({ timeout: 3000 });
        },
        { optional: true }
      );
      await page.locator('.text-note-modal').getByRole('button', { name: L.common.cancel }).click(quick).catch(() => {});
      await page.locator('.toolbar').getByRole('button', { name: L.toolbar.select }).click(quick).catch(() => {});
      await tab('rooms').click(quick).catch(() => {});
      await check(
        'plan-duplicate-apartment-dialog',
        async () => {
          await page.getByTitle(L.rooms.duplicateApartment.replace('{apartment}', '7')).click({ timeout: 3000, force: true });
          await page.locator('.modal').waitFor({ timeout: 3000 });
        },
        { optional: true }
      );
      await closeModal();
      await check(
        'plan-delete-confirm',
        async () => {
          await page.locator('.room-list li', { hasText: 'סלון' }).first().click(quick);
          expectDialog = true;
          await page.locator('.detail-header .icon-btn').last().click(quick);
          expectDialog = false;
          if (!report.dialogs.length) throw new Error('no confirm dialog appeared');
        },
        { optional: true }
      );
      expectDialog = false;
      // Auto-detect (AutoDetectPanel) is switched off in the product (SHOW_AUTO_DETECT = false in RoomPanel),
      // so there is nothing to open; its strings are translated and checked by the dictionary tests only.

      await page.getByTitle(L.topBar.backToOverview).first().click();
      await page.locator(`li[title="${L.projectOverview.openPlan}"]`).first().waitFor();
      await page.getByTitle(L.projectOverview.backToProjects).click();
      await page.locator('.saved-list li', { hasText: 'השוואת רגרסיה' }).click();
      await page.locator(`li[title="${L.projectOverview.openComparison}"]`).first().click();
      await waitForPlanRender(page);
      report.overlay[`compare-${pass}`] = await overlayTexts(page);
      report.rasters[`compare-${pass}`] = await canvasHashes(page);
      await check('compare');
      await check('compare-tab-measure', () => cmpTab('measure').click(quick));
      await check('compare-changes-panel', () => page.getByTitle(L.compare.changes.open).click(quick), { optional: true });
      await page.getByTitle(L.compare.changes.close).click(quick).catch(() => {});
      await check('compare-tab-markup', () => cmpTab('markup').click(quick));
      await cmpTab('layers').click(quick).catch(() => {});
      for (const mode of ['swipe', 'blink']) {
        await check(`compare-mode-${mode}`, () => page.getByTitle(L.compare.viewModes[`${mode}Hint`]).click(quick), { optional: true });
      }
      await page.getByTitle(L.compare.viewModes.overlayHint).click(quick).catch(() => {});
      const cmpMenus = await page.locator('.top-bar-menu-btn').count();
      for (let i = 0; i < cmpMenus; i++) {
        const btn = page.locator('.top-bar-menu-btn').nth(i);
        await check(`compare-menu-${i}`, () => btn.click(quick));
        await btn.click(quick).catch(() => {});
      }
      await check('compare-tool-align', () => page.locator(`button[aria-label="${L.compare.tools.align}"]`).click(quick));
      await context.close();
    }
  } finally {
    await browser?.close();
    devServer.kill();
  }

  // ---- verdict ----
  let failures = 0;
  const fail = (msg) => {
    failures++;
    console.log(`FAIL  ${msg}`);
  };
  const wantDir = MODE === 'en' ? 'ltr' : 'ltr';
  const wantLang = MODE === 'en' ? 'en' : 'he';
  for (const [name, target] of Object.entries(report.target)) {
    const base = report.base[name];
    if (target.unreachable || base?.unreachable) {
      if (target.optional || base?.optional) continue; // an optional surface; listed under "not covered"
      fail(`${name}: could not be inspected (${target.unreachable ?? base?.unreachable})`);
      continue;
    }
    if (target.info.dir !== wantDir || target.info.lang !== wantLang) fail(`${name}: html lang/dir is ${target.info.lang}/${target.info.dir}, expected ${wantLang}/${wantDir}`);
    if (base.info.dir !== 'rtl' || base.info.lang !== 'he') fail(`${name}: normal run html lang/dir is ${base.info.lang}/${base.info.dir}`);
    const known = new Set(MODE === 'en' ? [] : base.problems);
    for (const p of target.problems) if (!known.has(p)) fail(`${name}: ${p}`);
    for (const p of target.problems) if (known.has(p)) console.log(`note  ${name}: also in RTL — ${p}`);
    if (target.info.pageNav && target.info.pageNav !== 'previous-left') fail(`${name}: page-nav previous is not on the left in LTR`);
    if (base.info.pageNav && base.info.pageNav !== 'previous-right') fail(`${name}: page-nav previous is not on the right in RTL`);
    if (target.info.chevrons && target.info.chevrons !== 'mirrored/mirrored') fail(`${name}: page-nav chevrons not mirrored in LTR (${target.info.chevrons})`);
    if (base.info.chevrons && base.info.chevrons !== 'drawn/drawn') fail(`${name}: page-nav chevrons mirrored in RTL (${base.info.chevrons})`);
    if (target.info.breadcrumbChevron && target.info.breadcrumbChevron !== 'mirrored') fail(`${name}: breadcrumb chevron not mirrored in LTR`);
    if (base.info.breadcrumbChevron && base.info.breadcrumbChevron !== 'drawn') fail(`${name}: breadcrumb chevron mirrored in RTL`);
    if (MODE === 'en') {
      for (const t of interfaceHebrew(target.texts)) fail(`${name}: Hebrew in the English UI: ${JSON.stringify(t.slice(0, 80))}`);
    }
  }
  if (MODE === 'en') {
    for (const d of report.dialogs) if (interfaceHebrew([d.message]).length) fail(`native ${d.type} dialog in Hebrew: ${d.message}`);
    if (!report.dialogs.length) report.notCovered.push('native confirm dialogs: none appeared');
  }
  // Saved geometry: every text note sits at the same place whatever the language or direction. In
  // English the measurement labels' units read differently, so only the user's notes are compared.
  const notesOnly = (list) => (list ?? []).filter((t) => /הערה|קיר חדש|BC-12/.test(t.text));
  for (const kind of ['plan', 'compare']) {
    const a = JSON.stringify(MODE === 'en' ? notesOnly(report.overlay[`${kind}-base`]) : report.overlay[`${kind}-base`]);
    const b = JSON.stringify(MODE === 'en' ? notesOnly(report.overlay[`${kind}-target`]) : report.overlay[`${kind}-target`]);
    const count = JSON.parse(a ?? '[]').length;
    if (!count) fail(`${kind}: no overlay text captured`);
    else if (a !== b) fail(`${kind}: overlay text geometry differs from the Hebrew RTL run`);
    else console.log(`ok    ${kind}: ${count} overlay texts identical to the Hebrew RTL run`);
  }
  // The imported PDF itself: pixel-identical in the Hebrew RTL run and the run under test.
  for (const kind of ['plan', 'compare']) {
    const a = report.rasters[`${kind}-base`], b = report.rasters[`${kind}-target`];
    if (!a?.length) fail(`${kind}: no plan raster captured`);
    else if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${kind}: the plan raster differs between the Hebrew RTL run and ${MODE} (${a} vs ${b})`);
    else console.log(`ok    ${kind}: plan raster (${a.length} canvas${a.length > 1 ? 'es' : ''}) pixel-identical to the Hebrew RTL run`);
  }
  for (const e of report.errors) fail(`page error: ${e}`);
  for (const n of report.notCovered) console.log(`not covered: ${n}`);
  await writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`${Object.keys(report.target).length} screens checked (${MODE}), ${failures} failure(s). Screenshots: ${path.relative(ROOT, OUT)}`);
  process.exitCode = failures ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
