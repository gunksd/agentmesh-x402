"use client";

/**
 * Language context.
 *
 * Client-side only, with the choice persisted to localStorage. There is no
 * locale routing (`/zh/...`) because this is a single page and adding route
 * segments would mean duplicating every API path for no benefit.
 *
 * The initial render always uses the server default so the client markup matches
 * what the server produced; the stored or detected preference is applied in an
 * effect immediately after mount. Reading localStorage during render would
 * hydrate-mismatch.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LANG,
  detectLang,
  isLang,
  type Lang,
} from "@/lib/i18n/types";
import {
  DICTIONARIES,
  type Dictionary,
  type MessageKey,
} from "@/lib/i18n/dictionary";

const STORAGE_KEY = "agentmesh:lang";

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Looks up a message, substituting `{name}` placeholders. */
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  dict: Dictionary;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function interpolate(
  template: string,
  values?: Record<string, string | number>,
): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    name in values ? String(values[name]) : match,
  );
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  // Resolve the real preference after mount: stored choice wins, then the
  // browser's Accept-Language ordering.
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLang(stored)) {
      setLangState(stored);
      return;
    }
    setLangState(detectLang(navigator.languages ?? [navigator.language]));
  }, []);

  // Keep <html lang> honest for screen readers and browser translation prompts.
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing can reject writes; the choice still applies this session.
    }
  }, []);

  const value = useMemo<LanguageContextValue>(() => {
    const dict = DICTIONARIES[lang];
    return {
      lang,
      setLang,
      dict,
      t: (key, values) => interpolate(dict[key], values),
    };
  }, [lang, setLang]);

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }
  return context;
}

/** Shorthand for components that only need the lookup function. */
export function useT() {
  return useLanguage().t;
}
