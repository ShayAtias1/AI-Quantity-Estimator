/**
 * Real (vector) text and table graphics for BetterCalc's PDF reports.
 *
 * pdf-lib's standard fonts cannot encode Hebrew, so reports used to draw every page on a <canvas>
 * and embed it as a PNG — bitmap text that goes soft on zoom and in print. This module draws text as
 * selectable PDF text instead, in an embedded Noto Sans Hebrew (subset to the glyphs used):
 *
 * - Hebrew needs no glyph shaping, only visual reordering. Each string is reordered with the Unicode
 *   bidi algorithm (bidi-js) on an RTL base by default — the same result the canvas gave with
 *   `ctx.direction = 'rtl'` — and drawn left to right, glyph runs split between the font's Hebrew
 *   and Latin subsets (lib/pdfTextRuns). A painter, or a single string, can ask for an LTR base.
 * - `PdfPainter` exposes a canvas-like API (top-left origin, fillRect/strokeRect/fillText with
 *   textAlign and maxWidth) so table layouts written for the canvas carry over unchanged.
 *
 * Only real images (the rendered plan pages) stay raster.
 */

import {
  concatTransformationMatrix,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  type PDFDocument,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import hebrewRegularUrl from '@fontsource/noto-sans-hebrew/files/noto-sans-hebrew-hebrew-400-normal.woff?url';
import hebrewBoldUrl from '@fontsource/noto-sans-hebrew/files/noto-sans-hebrew-hebrew-700-normal.woff?url';
import latinRegularUrl from '@fontsource/noto-sans-hebrew/files/noto-sans-hebrew-latin-400-normal.woff?url';
import latinBoldUrl from '@fontsource/noto-sans-hebrew/files/noto-sans-hebrew-latin-700-normal.woff?url';
import logoSvg from '../assets/logo/bettercalc-logo.svg?raw';
import { fontRuns, lineStartX, startAlign, visualOrder, type TextAlign, type TextDirection } from './pdfTextRuns';

interface FontPair {
  hebrew: PDFFont;
  latin: PDFFont;
}

export interface ReportFonts {
  regular: FontPair;
  bold: FontPair;
}

/** Embeds the report fonts into a document (subset, so only glyphs actually drawn are stored). */
export async function embedReportFonts(doc: PDFDocument): Promise<ReportFonts> {
  doc.registerFontkit(fontkit);
  const embed = async (url: string) => doc.embedFont(await fetch(url).then((r) => r.arrayBuffer()), { subset: true });
  const [hr, hb, lr, lb] = await Promise.all([hebrewRegularUrl, hebrewBoldUrl, latinRegularUrl, latinBoldUrl].map(embed));
  return { regular: { hebrew: hr, latin: lr }, bold: { hebrew: hb, latin: lb } };
}

/** '#1F4E79' → pdf-lib colour. */
export function hex(color: string) {
  const n = parseInt(color.replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export interface TextStyle {
  size: number;
  bold?: boolean;
  color?: string;
  /**
   * Paragraph direction of this string. Defaults to the painter's direction, which the report sets.
   */
  direction?: TextDirection;
  /** Like canvas `textAlign`: which point of the text `x` names. Defaults to the direction's start side: right for RTL, left for LTR. */
  align?: TextAlign;
  /**
   * Like canvas `fillText`'s maxWidth: text wider than this is condensed horizontally to fit, at
   * its full height — the same thing the canvas did, so layouts look as they always have.
   */
  maxWidth?: number;
}

/**
 * The report font has no "²" (the m² of the English reports), so it is drawn as a small raised "2" in
 * the same font instead of falling back to an empty box. Text without "²" — all of the Hebrew
 * reports — comes back as it was, one run each at the text's own size and no rise.
 */
function withSuperscripts(runs: { text: string; font: PDFFont }[], size: number): { text: string; font: PDFFont; size: number; rise: number }[] {
  const out: { text: string; font: PDFFont; size: number; rise: number }[] = [];
  for (const run of runs) {
    run.text.split(/(²)/).forEach((part) => {
      if (part === '') return;
      if (part === '²') out.push({ text: '2', font: run.font, size: size * 0.62, rise: size * 0.36 });
      else out.push({ text: part, font: run.font, size, rise: 0 });
    });
  }
  return out;
}

/**
 * Canvas-like drawing on one PDF page. Coordinates are top-left based, in PDF points, exactly as the
 * canvas layouts were in pixels; `y` for text is the baseline. `direction` is the default paragraph
 * direction of its text, given explicitly by the report (RTL for Hebrew, LTR for English).
 */
export class PdfPainter {
  readonly page: PDFPage;
  readonly direction: TextDirection;
  private fonts: ReportFonts;
  private height: number;

  constructor(page: PDFPage, fonts: ReportFonts, direction: TextDirection) {
    this.page = page;
    this.fonts = fonts;
    this.direction = direction;
    this.height = page.getHeight();
  }

  fillRect(x: number, y: number, w: number, h: number, color: string) {
    this.page.drawRectangle({ x, y: this.height - y - h, width: w, height: h, color: hex(color) });
  }

  strokeRect(x: number, y: number, w: number, h: number, color: string, lineWidth = 1) {
    this.page.drawRectangle({ x, y: this.height - y - h, width: w, height: h, borderColor: hex(color), borderWidth: lineWidth });
  }

  /** A straight line between two top-left-based points — table column boundaries. */
  line(x1: number, y1: number, x2: number, y2: number, color: string, lineWidth = 1) {
    this.page.drawLine({
      start: { x: x1, y: this.height - y1 },
      end: { x: x2, y: this.height - y2 },
      thickness: lineWidth,
      color: hex(color),
    });
  }

  /** Width of `text` at `size` as it would be drawn (after bidi reordering). */
  measure(text: string, size: number, bold = false, direction: TextDirection = this.direction): number {
    const pair = bold ? this.fonts.bold : this.fonts.regular;
    return withSuperscripts(fontRuns(visualOrder(text, direction), pair), size).reduce((w, r) => w + r.font.widthOfTextAtSize(r.text, r.size), 0);
  }

  fillText(text: string, x: number, y: number, style: TextStyle) {
    if (!text) return;
    const pair = style.bold ? this.fonts.bold : this.fonts.regular;
    const direction = style.direction ?? this.direction;
    const size = style.size;
    const runs = withSuperscripts(fontRuns(visualOrder(text, direction), pair), size);
    const natural = runs.reduce((w, r) => w + r.font.widthOfTextAtSize(r.text, r.size), 0);
    const condense = style.maxWidth != null && natural > style.maxWidth && natural > 0 ? Math.max(style.maxWidth, 1) / natural : 1;
    const width = natural * condense;
    const startX = lineStartX(x, width, style.align ?? startAlign(direction));
    const color = hex(style.color ?? '#1e293b');
    // Runs are laid out at their natural widths in a local space whose x axis is scaled by
    // `condense` — one transform for the whole line, so the runs stay butted together.
    this.page.pushOperators(pushGraphicsState(), concatTransformationMatrix(condense, 0, 0, 1, startX, this.height - y));
    let cx = 0;
    for (const run of runs) {
      this.page.drawText(run.text, { x: cx, y: run.rise, size: run.size, font: run.font, color });
      cx += run.font.widthOfTextAtSize(run.text, run.size);
    }
    this.page.pushOperators(popGraphicsState());
  }
}

// ---------- logo ----------

interface LogoPath {
  d: string;
  color: string;
}

/**
 * Rewrites an even-odd polygon path so pdf-lib's nonzero fill draws it the same: every subpath
 * nested inside another gets the opposite winding, which turns it into a hole. Only straight-edge
 * paths (absolute M/H/V/L/Z) are rewritten; anything else is returned as is.
 */
function evenOddToNonZero(d: string): string {
  if (/[^MHVLZ0-9.,\s-]/i.test(d) || /[hvlmz]/.test(d)) return d;
  const polys: [number, number][][] = [];
  const tokens = d.match(/[MHVLZ]|-?\d*\.?\d+/g) ?? [];
  let cmd = '';
  let x = 0;
  let y = 0;
  for (let i = 0; i < tokens.length; ) {
    const t = tokens[i];
    if (/[MHVLZ]/.test(t)) {
      cmd = t;
      i++;
      if (cmd === 'Z') cmd = '';
      continue;
    }
    if (cmd === 'M') {
      x = +tokens[i++];
      y = +tokens[i++];
      polys.push([[x, y]]);
      cmd = 'L';
      continue;
    }
    if (cmd === 'H') x = +tokens[i++];
    else if (cmd === 'V') y = +tokens[i++];
    else if (cmd === 'L') {
      x = +tokens[i++];
      y = +tokens[i++];
    } else return d;
    polys[polys.length - 1].push([x, y]);
  }
  const area = (p: [number, number][]) => p.reduce((a, [x1, y1], i) => { const [x2, y2] = p[(i + 1) % p.length]; return a + x1 * y2 - x2 * y1; }, 0);
  const inside = ([px, py]: [number, number], p: [number, number][]) => {
    let c = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [xi, yi] = p[i];
      const [xj, yj] = p[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  return polys
    .map((p, i) => {
      const depth = polys.filter((q, j) => j !== i && inside(p[0], q)).length;
      const wantPositive = depth % 2 === 0;
      const pts = area(p) > 0 === wantPositive ? p : [...p].reverse();
      return `M${pts.map(([px, py]) => `${px} ${py}`).join('L')}Z`;
    })
    .join('');
}

/** Report-header logo size, in points: small, on the empty side of the title line (left for RTL, right for LTR). */
export const REPORT_LOGO_HEIGHT = 12;

/** The app's own BetterCalc lockup (src/assets/logo), read once as vector paths. */
const LOGO: { paths: LogoPath[]; minX: number; minY: number; width: number; height: number } = (() => {
  const doc = new DOMParser().parseFromString(logoSvg, 'image/svg+xml');
  const [minX, minY, width, height] = (doc.documentElement.getAttribute('viewBox') ?? '0 0 1 1').split(/[\s,]+/).map(Number);
  const paths = Array.from(doc.querySelectorAll('path')).map((el) => {
    const d = el.getAttribute('d') ?? '';
    return { d: el.getAttribute('fill-rule') === 'evenodd' ? evenOddToNonZero(d) : d, color: el.getAttribute('fill') ?? '#172033' };
  });
  return { paths, minX, minY, width, height };
})();

/** Width the logo takes at `height` points tall — to place it flush against the right margin. */
export function logoWidth(height: number): number {
  return (LOGO.width * height) / LOGO.height;
}

/**
 * Draws the BetterCalc logo as vector paths with its top-left corner at (x, y) — top-left page
 * coordinates, like the rest of PdfPainter — `height` points tall. Returns the drawn width.
 */
export function drawLogo(painter: PdfPainter, x: number, y: number, height: number): number {
  const scale = height / LOGO.height;
  const pageH = painter.page.getHeight();
  for (const path of LOGO.paths) {
    painter.page.drawSvgPath(path.d, {
      x: x - LOGO.minX * scale,
      y: pageH - y + LOGO.minY * scale,
      scale,
      color: hex(path.color),
    });
  }
  return LOGO.width * scale;
}
