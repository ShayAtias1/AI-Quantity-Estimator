/**
 * The pure text-layout steps behind `PdfPainter` (lib/pdfText.ts): bidi reordering in an explicit
 * paragraph direction, splitting into font runs, and placing a line by its alignment. Kept apart from
 * pdfText.ts, which loads the report fonts, so they can be tested on their own.
 */

import bidiFactory from 'bidi-js';

/**
 * Paragraph direction a string is laid out in. Reports are RTL; 'ltr' exists so a later report can
 * ask for it — the bidi base decides where neutral characters (":", "(", "%", ".") land.
 */
export type TextDirection = 'rtl' | 'ltr';

export type TextAlign = 'left' | 'right' | 'center';

const bidi = bidiFactory();

/** Logical → visual order for a paragraph in `direction` (mirrors brackets too), ready to draw left to right. */
export function visualOrder(text: string, direction: TextDirection): string {
  const levels = bidi.getEmbeddingLevels(text, direction);
  return bidi.getReorderedString(text, levels);
}

export const isHebrew = (ch: string) => {
  const c = ch.codePointAt(0)!;
  return (c >= 0x0590 && c <= 0x05ff) || (c >= 0xfb1d && c <= 0xfb4f) || c === 0x20aa;
};

/**
 * Splits a visual-order string into runs that each use one font subset. fontkit (pdf-lib's font
 * engine) recognises Hebrew as an RTL script and reverses a Hebrew run's glyphs itself, so each
 * Hebrew run is handed over in logical order — its reversal then lands on the visual order.
 */
export function fontRuns<F>(visual: string, pair: { hebrew: F; latin: F }): { text: string; font: F }[] {
  const runs: { text: string; font: F }[] = [];
  for (const ch of visual) {
    const font = isHebrew(ch) ? pair.hebrew : pair.latin;
    const last = runs[runs.length - 1];
    if (last && last.font === font) last.text += ch;
    else runs.push({ text: ch, font });
  }
  for (const run of runs) if (run.font === pair.hebrew) run.text = Array.from(run.text).reverse().join('');
  return runs;
}

/** The alignment a line takes when none is given: its start side — right for RTL, left for LTR. */
export function startAlign(direction: TextDirection): TextAlign {
  return direction === 'rtl' ? 'right' : 'left';
}

/** Left edge of a line `width` wide whose `align` point is at `x` (canvas `textAlign` semantics). */
export function lineStartX(x: number, width: number, align: TextAlign): number {
  return align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
}
