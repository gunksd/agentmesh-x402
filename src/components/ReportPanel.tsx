"use client";

/**
 * The deliverable: what the orchestrator bought.
 *
 * Shown only once the report agent has been paid, so the panel appearing is
 * itself the proof that the final settlement went through.
 */

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { Direction, ReportResult } from "@/lib/agents/analysis";
import { Badge, type BadgeTone } from "./ui/Badge";
import { cn, formatPrice } from "@/lib/utils";

const DIRECTION_META: Record<
  Direction,
  { label: string; tone: BadgeTone; Icon: typeof ArrowUpRight }
> = {
  long: { label: "Long bias", tone: "success", Icon: ArrowUpRight },
  short: { label: "Short bias", tone: "danger", Icon: ArrowDownRight },
  neutral: { label: "No edge", tone: "neutral", Icon: ArrowRight },
};

export function ReportPanel({
  report,
  className,
}: {
  report: ReportResult;
  className?: string;
}) {
  const { label, tone, Icon } = DIRECTION_META[report.direction];
  const confidencePercent = Math.round(report.confidence * 100);

  return (
    <div className={cn("px-5 py-4", className)}>
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-[15px] font-semibold leading-snug tracking-tight">
          {report.headline}
        </h3>
        <Badge tone={tone} className="mt-0.5 gap-1">
          <Icon aria-hidden className="size-3" />
          {label}
        </Badge>
      </div>

      {/* Confidence as a bar rather than a number alone — easier to read at a glance. */}
      <div className="mt-3.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-[var(--subtle)]">Confidence</span>
          <span className="numeric font-semibold">{confidencePercent}%</span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--surface)]">
          <div
            className="h-full rounded-full bg-[var(--brand)] transition-[width] duration-700 ease-out"
            style={{ width: `${confidencePercent}%` }}
          />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {report.narrative.map((paragraph, index) => (
          <p
            key={index}
            className="text-[12px] leading-relaxed text-[var(--muted)]"
          >
            {paragraph}
          </p>
        ))}
      </div>

      {report.levels.length > 0 ? (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[var(--border)] pt-3.5 sm:grid-cols-3">
          {report.levels.map((level) => (
            <div key={`${level.label}-${level.value}`} className="min-w-0">
              <dt className="truncate text-[10px] uppercase tracking-wide text-[var(--subtle)]">
                {level.label}
              </dt>
              <dd className="numeric mt-0.5 text-[12px] font-semibold">
                {formatPrice(level.value)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
