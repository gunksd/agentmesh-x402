"use client";

/**
 * Download and open buttons for the report PDF.
 *
 * jsPDF is imported dynamically. It is ~350KB and only needed once a report
 * exists, so pulling it into the initial bundle would slow the first paint for
 * every visitor to pay for a feature most never reach.
 */

import { useState } from "react";
import { Download, ExternalLink, Loader2 } from "lucide-react";
import type { ReportResult, SignalsResult } from "@/lib/agents/analysis";
import type { OrderPreview } from "@/lib/agents/order";
import { useLanguage } from "./LanguageProvider";
import { cn } from "@/lib/utils";

export function ReportActions({
  symbol,
  report,
  signals,
  order,
  transactions,
  className,
}: {
  symbol: string;
  report: ReportResult;
  signals?: SignalsResult;
  order?: OrderPreview | null;
  transactions?: { agent: string; hash: string }[];
  className?: string;
}) {
  const { t, lang } = useLanguage();
  const [busy, setBusy] = useState<"download" | "open" | null>(null);

  async function run(mode: "download" | "open") {
    setBusy(mode);
    try {
      const { buildReportPdf, reportFilename } = await import("@/lib/report/pdf");
      const doc = buildReportPdf({
        symbol,
        report,
        signals,
        order,
        lang,
        transactions,
      });

      if (mode === "download") {
        doc.save(reportFilename(symbol));
        return;
      }

      // Open via a blob URL rather than doc.output("dataurlnewwindow"), which
      // popup blockers reject more often.
      const url = URL.createObjectURL(doc.output("blob"));
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) {
        // Popup blocked — fall back to a download so the click still does something.
        doc.save(reportFilename(symbol));
      }
      // Give the tab time to load before revoking.
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } finally {
      setBusy(null);
    }
  }

  const buttonClass =
    "inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] " +
    "bg-[var(--surface-raised)] px-2.5 py-1.5 text-[11px] font-medium " +
    "transition-colors hover:bg-[var(--surface)] disabled:opacity-50";

  return (
    <div className={cn("flex flex-col items-end gap-1.5", className)}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void run("download")}
          disabled={busy !== null}
          className={buttonClass}
        >
          {busy === "download" ? (
            <Loader2 aria-hidden className="size-3 animate-spin" />
          ) : (
            <Download aria-hidden className="size-3" />
          )}
          {busy === "download" ? t("reportGenerating") : t("reportDownload")}
        </button>

        <button
          type="button"
          onClick={() => void run("open")}
          disabled={busy !== null}
          className={buttonClass}
        >
          {busy === "open" ? (
            <Loader2 aria-hidden className="size-3 animate-spin" />
          ) : (
            <ExternalLink aria-hidden className="size-3" />
          )}
          {t("reportOpen")}
        </button>
      </div>

      {/*
        Only shown in Chinese: an English reader gets an English PDF and needs no
        explanation, while a Chinese reader would otherwise be surprised by it.
      */}
      {lang === "zh" ? (
        <p className="max-w-[15rem] text-right text-[9.5px] leading-relaxed text-[var(--subtle)]">
          {t("pdfLanguageNote")}
        </p>
      ) : null}
    </div>
  );
}
