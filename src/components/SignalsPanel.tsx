"use client";

/**
 * Early signal scan: the A–E grade and what produced it.
 *
 * The component breakdown is shown rather than just the letter. A grade nobody can
 * audit is a number to argue with; a grade with its inputs and weights visible is
 * one a reader can check against their own view.
 */

import type { SignalsResult } from "@/lib/agents/analysis";
import { GradeBadge } from "./GradeBadge";
import { useLanguage } from "./LanguageProvider";
import { pick } from "@/lib/i18n/content";
import { Badge } from "./ui/Badge";
import { cn, formatCompact } from "@/lib/utils";

export function SignalsPanel({
  signals,
  className,
}: {
  signals: SignalsResult;
  className?: string;
}) {
  const { t, lang } = useLanguage();

  return (
    <div className={cn("px-5 py-4", className)}>
      <div className="flex items-start gap-4">
        <GradeBadge grade={signals.grade} size={72} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold tracking-tight">
              {pick(signals.regimeLabel, lang)}
            </span>
            <Badge tone="brand" mono>
              {signals.score}/100
            </Badge>
            {signals.openInterestUsd ? (
              <Badge mono>OI ${formatCompact(signals.openInterestUsd)}</Badge>
            ) : null}
          </div>

          <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--muted)]">
            {pick(signals.regimeNote, lang)}
          </p>

          {signals.degraded ? (
            <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--warning)]">
              {t("signalDegraded")}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-3.5">
        <p className="text-[10px] uppercase tracking-wide text-[var(--subtle)]">
          {t("signalComponents")}
        </p>

        {signals.components.map((component) => (
          <div
            key={component.key}
            className={cn(
              "flex items-center gap-3",
              // Excluded components are shown but dimmed: hiding them would make
              // the weights look like they do not add up.
              !component.available && "opacity-45",
            )}
          >
            <span className="w-32 shrink-0 truncate text-[11px] font-medium">
              {pick(component.label, lang)}
            </span>

            {/* Bar width is the raw score; opacity carries the weight, so a
                heavily-weighted component reads as more solid. */}
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--surface)]">
              <span
                className="block h-full rounded-full bg-[var(--brand)] transition-[width] duration-500"
                style={{
                  width: `${Math.round(component.score * 100)}%`,
                  opacity: 0.35 + component.weight * 2.2,
                }}
              />
            </span>

            <span className="numeric w-9 shrink-0 text-right text-[10px] text-[var(--subtle)]">
              {component.available ? Math.round(component.score * 100) : "—"}
            </span>
          </div>
        ))}
      </div>

      {signals.components.some((c) => !c.available) ? (
        <p className="mt-2.5 text-[10px] leading-relaxed text-[var(--subtle)]">
          {t("signalExcludedNote")}
        </p>
      ) : null}

      <dl className="mt-3 space-y-1.5 border-t border-[var(--border)] pt-3">
        {signals.components.map((component) => (
          <div key={`${component.key}-detail`} className="flex gap-2">
            <dt className="w-32 shrink-0 text-[10px] text-[var(--subtle)]">
              {pick(component.label, lang)}
            </dt>
            <dd className="min-w-0 flex-1 text-[11px] leading-relaxed text-[var(--muted)]">
              {pick(component.detail, lang)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
