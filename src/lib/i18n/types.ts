/**
 * Locale types.
 *
 * Two languages, no library. next-intl or i18next would bring routing,
 * pluralisation and ICU message syntax — none of which this page needs, and all
 * of which cost bundle size. A typed dictionary plus a context is enough, and it
 * keeps every string checked at compile time.
 */

export type Lang = "en" | "zh";

export const LANGS: Lang[] = ["en", "zh"];

export const DEFAULT_LANG: Lang = "en";

/** Label shown on the toggle for each language, in that language. */
export const LANG_LABELS: Record<Lang, string> = {
  en: "EN",
  zh: "中文",
};

export function isLang(value: unknown): value is Lang {
  return value === "en" || value === "zh";
}

/**
 * Picks a starting language from the browser.
 *
 * Any `zh` variant — zh-CN, zh-TW, zh-Hans — maps to Chinese; everything else
 * falls back to English.
 */
export function detectLang(candidates: readonly string[]): Lang {
  for (const candidate of candidates) {
    if (candidate.toLowerCase().startsWith("zh")) return "zh";
    if (candidate.toLowerCase().startsWith("en")) return "en";
  }
  return DEFAULT_LANG;
}
