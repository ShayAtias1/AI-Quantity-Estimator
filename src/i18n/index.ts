/**
 * BetterCalc's UI language: the dictionaries, typed keys, translation helpers and the language
 * setting.
 *
 * - `he.ts` is the source dictionary. Its shape defines every key; another language is a file of the
 *   same shape (`Dictionary`), so a missing or extra key fails the build.
 * - Keys are dotted paths (`workTypes.tiling`). A value may hold `{name}` placeholders; the key's
 *   placeholders are then required parameters, checked at compile time.
 * - `translate(language, …)` is pure. `t(…)` uses the current UI language (for stores and libs);
 *   React components use `useT()`, which re-renders them when the language changes.
 * - The language is a UI setting of this browser only — never stored in a project, plan or
 *   comparison, so switching it can never change saved data.
 */

import { useCallback } from 'react';
import { create } from 'zustand';
import { he } from './he';
import { en } from './en';

// ---------- languages ----------

export type Language = 'he' | 'en';

export interface LanguageMeta {
  /** BCP 47 code, as written to `<html lang>`. */
  code: Language;
  /** Text direction of the UI in this language, as written to `<html dir>`. */
  dir: 'rtl' | 'ltr';
  /** Locale of the dates and numbers the UI shows (never of stored values). */
  locale: string;
}

export const LANGUAGES: Record<Language, LanguageMeta> = {
  he: { code: 'he', dir: 'rtl', locale: 'he-IL' },
  en: { code: 'en', dir: 'ltr', locale: 'en-GB' },
};

export const DEFAULT_LANGUAGE: Language = 'he';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && Object.hasOwn(LANGUAGES, value);
}

// ---------- dictionaries and keys ----------

/** The shape every language's dictionary must have: the Hebrew one, with any wording. */
export type Dictionary = Widen<typeof he>;
type Widen<T> = { readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

const DICTIONARIES: Record<Language, Dictionary> = { he, en };

/** Every dotted path to a string in the dictionary. */
export type TranslationKey = Leaves<typeof he>;
type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

type Lookup<T, K extends string> = K extends `${infer H}.${infer R}`
  ? H extends keyof T
    ? Lookup<T[H], R>
    : never
  : K extends keyof T
    ? T[K]
    : never;
type Placeholders<S> = S extends `${string}{${infer P}}${infer R}` ? PlaceholderName<P> | Placeholders<R> : never;
/** `{count|room|rooms}` (a plural word chosen by `count`) needs the same `count` as `{count}` does. */
type PlaceholderName<P extends string> = P extends `${infer N}|${string}` ? N : P;

/** `[]` for a key without placeholders, else `[{ name: value, … }]` naming exactly its placeholders. */
export type TranslationParams<K extends TranslationKey> = [Placeholders<Lookup<typeof he, K>>] extends [never]
  ? []
  : [params: Record<Placeholders<Lookup<typeof he, K>>, string | number>];

function lookup(dictionary: Dictionary, key: string): string | undefined {
  let node: unknown = dictionary;
  for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
  return typeof node === 'string' ? node : undefined;
}

/**
 * The text for `key` in `language`, with `{name}` placeholders filled. Falls back to Hebrew, then to
 * the key itself, so a gap can never render as nothing.
 */
export function translate<K extends TranslationKey>(language: Language, key: K, ...args: TranslationParams<K>): string {
  const text = lookup(DICTIONARIES[language], key) ?? lookup(he, key) ?? key;
  const params = args[0] as Record<string, string | number> | undefined;
  if (!params) return text;
  return text.replace(/\{(\w+)(?:\|([^|}]*)\|([^}]*))?\}/g, (match, name: string, one?: string, other?: string) => {
    if (!Object.hasOwn(params, name)) return match;
    // `{count|room|rooms}`: the word for exactly one, else the plural. Only English writes these.
    if (one !== undefined && other !== undefined) return Number(params[name]) === 1 ? one : other;
    return String(params[name]);
  });
}

// ---------- the UI language setting ----------

const STORAGE_KEY = 'bettercalc.uiLanguage';

/** The saved UI language of this browser, if valid; storage can be missing or throw. */
function savedLanguage(): Language {
  try {
    const value = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (isLanguage(value)) return value;
  } catch {
    // private mode or blocked storage: use the default
  }
  return DEFAULT_LANGUAGE;
}

interface LanguageState {
  language: Language;
  setLanguage: (language: Language) => void;
}

export const useLanguageStore = create<LanguageState>((set) => ({
  language: savedLanguage(),
  setLanguage: (language) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // still switch for this session
    }
    set({ language });
  },
}));

/** Text in the current UI language — for stores, libs and exports. Components use `useT()`. */
export function t<K extends TranslationKey>(key: K, ...args: TranslationParams<K>): string {
  return translate(useLanguageStore.getState().language, key, ...args);
}

export type TranslateFn = typeof t;

/** `t` bound to one language, whatever the UI language is — for output that names its language explicitly (exports). */
export function translatorFor(language: Language): TranslateFn {
  return (key, ...args) => translate(language, key, ...args);
}

/** The current UI language (for stores and libs; components use `useLanguage()`). */
export function currentLanguage(): Language {
  return useLanguageStore.getState().language;
}

/** The UI language; the component re-renders when it changes. */
export function useLanguage(): Language {
  return useLanguageStore((s) => s.language);
}

/**
 * A date as the UI shows it. Hebrew keeps the numeric form it has always had; English spells the
 * month out ("2 Oct 2026"), which reads the same wherever day-month order differs. Display only.
 */
export function formatDate(value: number | Date, language: Language = currentLanguage()): string {
  const date = typeof value === 'number' ? new Date(value) : value;
  return language === 'he'
    ? date.toLocaleDateString(LANGUAGES.he.locale)
    : date.toLocaleDateString(LANGUAGES[language].locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A number as the UI shows it, up to two decimals. Display only — never fed back into calculations. */
export function formatNumber(value: number, language: Language = currentLanguage()): string {
  return value.toLocaleString(language === 'he' ? LANGUAGES.he.locale : 'en-US', { maximumFractionDigits: 2 });
}

/** `t` bound to the current UI language; the component re-renders when the language changes. */
export function useT(): TranslateFn {
  const language = useLanguageStore((s) => s.language);
  return useCallback(
    <K extends TranslationKey>(key: K, ...args: TranslationParams<K>) => translate(language, key, ...args),
    [language]
  ) as TranslateFn;
}

/**
 * Keeps `<html lang>`, `<html dir>` and the document title on the current language. index.html
 * carries the same values for the first paint; from here on they follow the setting.
 */
export function syncDocumentLanguage(directionOverride?: 'rtl' | 'ltr' | null): void {
  const apply = (language: Language) => {
    const meta = LANGUAGES[language];
    document.documentElement.lang = meta.code;
    document.documentElement.dir = directionOverride ?? meta.dir;
    document.title = translate(language, 'app.documentTitle');
  };
  apply(useLanguageStore.getState().language);
  useLanguageStore.subscribe((state, prev) => {
    if (state.language !== prev.language) apply(state.language);
  });
}
