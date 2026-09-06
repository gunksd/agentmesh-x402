"use client";

/**
 * Page footer.
 *
 * Split from page.tsx so the copy can read the language dictionary without
 * turning the whole page into a client component.
 */

import { useLanguage } from "./LanguageProvider";

export function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="border-t border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 py-8 text-[11px] text-[var(--subtle)] sm:flex-row sm:items-center sm:justify-between">
        <p>{t("footerLeft")}</p>
        <p>{t("footerRight")}</p>
      </div>
    </footer>
  );
}
