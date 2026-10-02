import { LANGUAGES, type Language } from '../i18n';

const RTL_LETTER = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const LTR_LETTER = /\p{Script=Latin}|\p{Script=Greek}|\p{Script=Cyrillic}/u;

/**
 * The direction an on-plan label (a measurement value, a room's name) is laid out in. The overlay
 * SVG itself is pinned RTL so saved text notes never move, but a label is not a saved position: it is
 * centred on its point, so it can read in its own direction.
 *
 * Hebrew UI: always RTL, exactly as the overlay has always drawn them. Any other UI language: the
 * first strong letter decides (a Hebrew room name stays RTL inside an English UI), and a label with no
 * letters ("12.5") follows the language, so "8.9 m" does not come out as "m 8.9".
 */
export function labelDirection(text: string, language: Language): 'rtl' | 'ltr' {
  if (language === 'he') return 'rtl';
  for (const ch of text) {
    if (RTL_LETTER.test(ch)) return 'rtl';
    if (LTR_LETTER.test(ch)) return 'ltr';
  }
  return LANGUAGES[language].dir;
}
