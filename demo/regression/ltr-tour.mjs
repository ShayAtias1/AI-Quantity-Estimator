// LTR readiness tour: drives the real app in forced LTR (dev-only `?dir=ltr`, see src/i18n/index.ts)
// and in normal RTL, visits the important screens, and reports layout failures.
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'demo', 'output', 'ltr');
const ORIGINAL_PDF = path.join(ROOT, 'demo', 'assets', 'BetterCalc_Demo_Apartment_A_Floor_Plan.pdf');
const REVISION_PDF = path.join(ROOT, 'demo', 'assets', 'BetterCalc_Demo_Apartment_A_Revision_B.pdf');
const DEV_PORT = 5188;
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
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.pdf-viewport .overlay-svg text')).map((t) => {
      const b = t.getBBox();
      const r = (v) => Math.round(v * 100) / 100;
      return { text: t.textContent, x: r(b.x), y: r(b.y), width: r(b.width), height: r(b.height) };
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
  return { problems, info };
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const devServer = spawn('npm', ['run', 'dev', '--', '--port', String(DEV_PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
  devServer.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
  let browser;
  const report = { rtl: {}, ltr: {}, overlay: {}, errors: [] };
  try {
    await waitForServer(DEV_URL, 30_000);
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', (e) => report.errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && report.errors.push(m.text()));
    page.on('dialog', (d) => {
      report.errors.push(`dialog: ${d.message()}`);
      void d.dismiss();
    });

    await page.goto(DEV_URL);
    await page.getByRole('button', { name: 'פרויקט חדש' }).waitFor();
    await seed(page);

    for (const dir of ['rtl', 'ltr']) {
      const results = (report[dir] = {});
      const check = async (name, action) => {
        try {
          if (action) await action();
          await pause(350);
          results[name] = await page.evaluate(inspectLayout);
          if (dir === 'ltr') await page.screenshot({ path: path.join(OUT, `${name}.png`) });
        } catch (err) {
          results[name] = { unreachable: String(err).split('\n')[0] };
        }
      };
      const closeModal = () => page.locator('.modal').getByRole('button', { name: 'ביטול' }).click(quick).catch(() => {});

      await page.goto(dir === 'ltr' ? `${DEV_URL}/?dir=ltr` : DEV_URL);
      await page.locator('.saved-list li').first().waitFor();
      await check('home');
      await check('home-new-project', () => page.getByRole('button', { name: 'פרויקט חדש' }).click(quick));
      await closeModal();

      await page.locator('.saved-list li', { hasText: 'פרויקט רגרסיה' }).click();
      await page.locator('li[title="פתח את התוכנית"]').first().waitFor();
      await check('overview');
      await check('overview-summary-row', () => page.locator('.project-summary-row').first().click(quick));
      await check('overview-add-plan', () => page.getByRole('button', { name: 'תוכנית חדשה' }).click(quick));
      await closeModal();
      await check('overview-add-comparison', () => page.getByRole('button', { name: 'השוואה חדשה' }).click(quick));
      await closeModal();

      await page.locator('li[title="פתח את התוכנית"]').first().click();
      await waitForPlanRender(page);
      report.overlay[`plan-${dir}`] = await overlayTexts(page);
      await check('plan');
      await check('plan-room-selected', () => page.locator('.room-list li', { hasText: 'סלון' }).first().click(quick));
      await check('plan-tab-measure', () => page.locator('.sidebar-tabs button', { hasText: 'מדידות' }).click(quick));
      await check('plan-tab-markup', () => page.locator('.sidebar-tabs button', { hasText: 'סימונים' }).click(quick));
      await page.locator('.sidebar-tabs button', { hasText: 'חדרים ודירות' }).click(quick).catch(() => {});
      await check('plan-quantities', () => page.getByTitle('פתח את טבלת הכמויות').click(quick));
      await check('plan-quantities-defaults', () => page.getByTitle('ברירות המחדל שמהן נגזרים הפחת והגבהים של פריטי עבודה חדשים').click(quick));
      await page.getByTitle('סגור את חלונית הכמויות').click(quick).catch(() => {});
      const planMenus = await page.locator('.top-bar-menu-btn').count();
      for (let i = 0; i < planMenus; i++) {
        const btn = page.locator('.top-bar-menu-btn').nth(i);
        await check(`plan-menu-${i}`, () => btn.click(quick));
        await btn.click(quick).catch(() => {});
      }
      await check('plan-tool-calibrate', () => page.getByRole('button', { name: 'כיול קנה מידה' }).click(quick));
      await check('plan-tool-draw', () => page.locator('.toolbar').getByRole('button', { name: 'סימון חדר' }).click(quick));
      await page.locator('.toolbar').getByRole('button', { name: 'בחירה' }).click(quick).catch(() => {});

      await page.getByTitle('שמירה וחזרה לסקירת הפרויקט').first().click();
      await page.locator('li[title="פתח את התוכנית"]').first().waitFor();
      await page.getByTitle('חזרה לרשימת הפרויקטים').click();
      await page.locator('.saved-list li', { hasText: 'השוואת רגרסיה' }).click();
      await page.locator('li[title="פתח את ההשוואה"]').first().click();
      await waitForPlanRender(page);
      report.overlay[`compare-${dir}`] = await overlayTexts(page);
      await check('compare');
      await check('compare-tab-measure', () => page.locator('.sidebar-tabs button', { hasText: 'כיול ומדידה' }).click(quick));
      await check('compare-tab-markup', () => page.locator('.sidebar-tabs button', { hasText: 'סימונים' }).click(quick));
      await page.locator('.sidebar-tabs button', { hasText: 'שכבות ויישור' }).click(quick).catch(() => {});
      const cmpMenus = await page.locator('.top-bar-menu-btn').count();
      for (let i = 0; i < cmpMenus; i++) {
        const btn = page.locator('.top-bar-menu-btn').nth(i);
        await check(`compare-menu-${i}`, () => btn.click(quick));
        await btn.click(quick).catch(() => {});
      }
      await check('compare-tool-align', () => page.locator('button[aria-label="יישור"]').click(quick));
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
  for (const [name, ltr] of Object.entries(report.ltr)) {
    const rtl = report.rtl[name];
    if (ltr.unreachable || rtl?.unreachable) {
      fail(`${name}: could not be inspected (${ltr.unreachable ?? rtl?.unreachable})`);
      continue;
    }
    if (ltr.info.dir !== 'ltr' || ltr.info.lang !== 'he') fail(`${name}: html dir/lang is ${ltr.info.dir}/${ltr.info.lang}`);
    if (rtl.info.dir !== 'rtl' || rtl.info.lang !== 'he') fail(`${name}: normal run html dir/lang is ${rtl.info.dir}/${rtl.info.lang}`);
    const known = new Set(rtl.problems);
    for (const p of ltr.problems) if (!known.has(p)) fail(`${name}: ${p}`);
    for (const p of ltr.problems) if (known.has(p)) console.log(`note  ${name}: also in RTL — ${p}`);
    if (ltr.info.pageNav && ltr.info.pageNav !== 'previous-left') fail(`${name}: page-nav previous is not on the left in LTR`);
    if (rtl.info.pageNav && rtl.info.pageNav !== 'previous-right') fail(`${name}: page-nav previous is not on the right in RTL`);
    if (ltr.info.chevrons && ltr.info.chevrons !== 'mirrored/mirrored') fail(`${name}: page-nav chevrons not mirrored in LTR (${ltr.info.chevrons})`);
    if (rtl.info.chevrons && rtl.info.chevrons !== 'drawn/drawn') fail(`${name}: page-nav chevrons mirrored in RTL (${rtl.info.chevrons})`);
    if (ltr.info.breadcrumbChevron && ltr.info.breadcrumbChevron !== 'mirrored') fail(`${name}: breadcrumb chevron not mirrored in LTR`);
    if (rtl.info.breadcrumbChevron && rtl.info.breadcrumbChevron !== 'drawn') fail(`${name}: breadcrumb chevron mirrored in RTL`);
  }
  for (const kind of ['plan', 'compare']) {
    const a = JSON.stringify(report.overlay[`${kind}-rtl`]);
    const b = JSON.stringify(report.overlay[`${kind}-ltr`]);
    if (!report.overlay[`${kind}-rtl`]?.length) fail(`${kind}: no overlay text captured`);
    else if (a !== b) fail(`${kind}: overlay text geometry differs between RTL and LTR`);
    else console.log(`ok    ${kind}: ${report.overlay[`${kind}-ltr`].length} overlay texts identical in RTL and LTR`);
  }
  for (const e of report.errors) fail(`page error: ${e}`);
  await writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`${Object.keys(report.ltr).length} screens checked in LTR, ${failures} failure(s). Screenshots: ${path.relative(ROOT, OUT)}`);
  process.exitCode = failures ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
