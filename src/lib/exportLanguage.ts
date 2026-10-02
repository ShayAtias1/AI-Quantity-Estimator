import { LANGUAGES, formatDate, formatNumber, translatorFor, type Language, type TranslateFn } from '../i18n';

/**
 * Everything an export needs to know about the language it is written in. Every export receives a
 * `Language` and resolves one of these at its start — nothing in an export reads the UI's `t`, the
 * page's direction or the browser's locale, so the same project exports the same way whatever the
 * screen is showing (and a later export-language setting only has to pass a different `Language`).
 */
export interface ExportContext {
  language: Language;
  /** Dictionary lookup in the export language. */
  t: TranslateFn;
  /** Reading direction of the generated document: Hebrew reports are RTL, English LTR. */
  direction: 'rtl' | 'ltr';
  rtl: boolean;
  /** Today's date as this language writes it. */
  today: () => string;
  /** A number as this language writes it (display text only — worksheet cells stay real numbers). */
  number: (value: number) => string;
}

export function exportContext(language: Language): ExportContext {
  const direction = LANGUAGES[language].dir;
  return {
    language,
    t: translatorFor(language),
    direction,
    rtl: direction === 'rtl',
    today: () => formatDate(new Date(), language),
    number: (value) => formatNumber(value, language),
  };
}

/**
 * Worksheet column widths for a language. Hebrew keeps the widths the workbooks were designed with;
 * another language widens a column only as far as its header needs (`headerLines` is how many lines the header may wrap onto), so a longer English heading is
 * not cut off by its neighbour.
 */
export function columnWidths(base: number[], headers: string[], language: Language, headerLines = 1): number[] {
  if (language === 'he') return base;
  return base.map((w, i) => {
    const header = headers[i] ?? '';
    // A header that may wrap needs room for its longest word, and for its length split over the lines.
    const longestWord = Math.max(0, ...header.split(/\s+/).map((word) => word.length));
    const needed = headerLines > 1 ? Math.max(longestWord, header.length / headerLines) : header.length;
    return Math.max(w, Math.ceil(needed * 1.1) + 3);
  });
}
