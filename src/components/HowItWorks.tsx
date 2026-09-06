"use client";

/**
 * Protocol explainer.
 *
 * A reviewer watching the demo needs to know what they are looking at before the
 * log scrolls past. Five steps, matching the five event types in the log.
 */

import { useLanguage } from "./LanguageProvider";
import { Badge } from "./ui/Badge";
import { Card } from "./ui/Card";
import type { MessageKey } from "@/lib/i18n/dictionary";

/** Step numbers stay numeric; the copy comes from the dictionary. */
const STEP_KEYS: {
  step: string;
  tag: MessageKey;
  title: MessageKey;
  body: MessageKey;
}[] = [
  { step: "01", tag: "step1Tag", title: "step1Title", body: "step1Body" },
  { step: "02", tag: "step2Tag", title: "step2Title", body: "step2Body" },
  { step: "03", tag: "step3Tag", title: "step3Title", body: "step3Body" },
  { step: "04", tag: "step4Tag", title: "step4Title", body: "step4Body" },
  { step: "05", tag: "step5Tag", title: "step5Title", body: "step5Body" },
];

export function HowItWorks() {
  const { t } = useLanguage();

  return (
    <section className="border-y border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto w-full max-w-6xl px-6 py-14 sm:py-20">
        <Badge tone="brand" className="w-fit">
          {t("howBadge")}
        </Badge>
        <h2 className="mt-3 max-w-2xl text-[26px] font-semibold tracking-tight sm:text-[30px]">
          {t("howTitle")}
        </h2>
        <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-[var(--muted)]">
          {t("howBody")}
        </p>

        <ol className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {STEP_KEYS.map((item) => (
            <Card key={item.step} as="article" className="p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="numeric text-[11px] font-semibold text-[var(--brand)]">
                  {item.step}
                </span>
                <Badge>{t(item.tag)}</Badge>
              </div>
              <h3 className="mt-2.5 text-[13px] font-semibold tracking-tight">
                {t(item.title)}
              </h3>
              <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--muted)]">
                {t(item.body)}
              </p>
            </Card>
          ))}
        </ol>
      </div>
    </section>
  );
}
