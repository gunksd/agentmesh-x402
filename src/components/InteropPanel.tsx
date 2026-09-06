"use client";

/**
 * Interoperability probe.
 *
 * The one panel where the counterparties are strangers. It calls endpoints other
 * people listed on Binance's B402 Bazaar and decodes the 402 each returns, using
 * the same client that pays our own agents.
 *
 * Nothing is spent: 402 is the unpaid response.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import type { InteropProbe, InteropReport } from "@/lib/agents/interop";
import { Badge } from "./ui/Badge";
import { useLanguage } from "./LanguageProvider";
import { cn, formatUsd } from "@/lib/utils";

function host(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

function ProbeRow({ probe }: { probe: InteropProbe }) {
  const { t } = useLanguage();
  const observed = probe.observed;
  const compatible =
    observed?.status === 402 &&
    !probe.networkMismatch &&
    !probe.versionMismatch;

  return (
    <li className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <p className="numeric min-w-0 flex-1 truncate text-[11px] font-medium">
          {host(probe.resource)}
        </p>
        {compatible ? (
          <Badge tone="success">{t("interopPayable")}</Badge>
        ) : probe.reachable ? (
          <Badge tone="warning">{t("interopIncompatible")}</Badge>
        ) : (
          <Badge tone="neutral">{t("interopUnreachable")}</Badge>
        )}
      </div>

      {observed ? (
        <p className="numeric mt-1.5 text-[10px] text-[var(--muted)]">
          {observed.status} · x402 v{observed.x402Version ?? "?"} ·{" "}
          {observed.scheme ?? "?"} · {observed.network ?? "?"}
          {probe.listed.priceUsd !== undefined
            ? ` · ${formatUsd(probe.listed.priceUsd)}`
            : ""}
        </p>
      ) : (
        <p className="mt-1.5 text-[10px] text-[var(--muted)]">
          {probe.note ?? "no response"}
        </p>
      )}

      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--muted)]">
        {probe.listed.description}
      </p>
    </li>
  );
}

export function InteropPanel({ className }: { className?: string }) {
  const { t } = useLanguage();
  const [report, setReport] = useState<InteropReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const probe = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/interop?query=crypto+price&limit=4");
      if (!response.ok) throw new Error(`probe returned ${response.status}`);
      setReport((await response.json()) as InteropReport);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "probe failed");
    } finally {
      setLoading(false);
    }
  }, []);

  // Probe once on mount so the panel has content without a click.
  useEffect(() => {
    void probe();
  }, [probe]);

  return (
    <div className={cn("px-5 py-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] leading-relaxed text-[var(--muted)]">
          {report
            ? t("panelInteropSummary", {
                ok: report.summary.quoting402,
                total: report.probes.length,
              })
            : t("panelInteropIdle")}
        </p>
        <button
          type="button"
          onClick={probe}
          disabled={loading}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[10px] text-[var(--muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--foreground)] disabled:opacity-50"
        >
          {loading ? (
            <Loader2 aria-hidden className="size-3 animate-spin" />
          ) : (
            <RefreshCw aria-hidden className="size-3" />
          )}
          {t("panelInteropReprobe")}
        </button>
      </div>

      {error ? (
        <p className="mt-3 text-[11px] text-[var(--danger)]">{error}</p>
      ) : null}

      {report ? (
        <ul className="mt-3 space-y-2">
          {report.probes.map((item) => (
            <ProbeRow key={item.resource} probe={item} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
