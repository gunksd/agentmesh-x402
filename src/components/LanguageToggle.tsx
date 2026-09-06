"use client";

/**
 * Language toggle.
 *
 * Two segments rather than a dropdown: with exactly two options a select costs an
 * extra click and hides the alternative. Rendered as a radiogroup so assistive
 * tech announces which language is active.
 */

import { Languages } from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import { LANGS, LANG_LABELS } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

export function LanguageToggle({ className }: { className?: string }) {
  const { lang, setLang, t } = useLanguage();

  return (
    <div
      role="radiogroup"
      aria-label={t("langSwitch")}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-[var(--border-strong)]",
        "bg-[var(--surface-raised)] p-0.5",
        className,
      )}
    >
      <Languages
        aria-hidden
        className="ml-1.5 mr-0.5 size-3 shrink-0 text-[var(--subtle)]"
      />
      {LANGS.map((option) => {
        const active = option === lang;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setLang(option)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
              active
                ? "bg-[var(--brand)] text-white"
                : "text-[var(--muted)] hover:text-[var(--foreground)]",
            )}
          >
            {LANG_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}
