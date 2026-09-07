"use client";

/**
 * Chart panel: the market the report was written against, moving live.
 *
 * Sits directly above the report so a reader sees the price is still ticking
 * while the conclusion sits underneath — the analysis was a snapshot, the market
 * is not.
 */

import { Activity, Radio } from "lucide-react";
import { useLiveChart } from "@/hooks/useLiveChart";
import { LiveChart } from "./LiveChart";
import { useLanguage } from "./LanguageProvider";
import { Badge } from "./ui/Badge";
import { cn, formatPercent, formatPrice } from "@/lib/utils";

export function ChartPanel({
  symbol,
  className,
}: {
  symbol: string;
  className?: string;
}) {
  const { t } = useLanguage();
  const { candles, price, changePercent, status } = useLiveChart(symbol, "1m");

  const rising = changePercent >= 0;

  return (
    <div className={cn("px-5 py-4", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <span className="numeric text-[13px] font-semibold tracking-tight">
            {symbol}
          </span>
          {price !== null ? (
            <span className="numeric text-[20px] font-semibold tracking-tight">
              {formatPrice(price)}
            </span>
          ) : (
            <span className="text-[12px] text-[var(--subtle)]">
              {t("chartLoading")}
            </span>
          )}
          {price !== null ? (
            <span
              className={cn(
                "numeric text-[12px] font-semibold",
                rising ? "text-[var(--success)]" : "text-[var(--danger)]",
              )}
            >
              {formatPercent(changePercent)}
            </span>
          ) : null}
        </div>

        {/* Connection state, stated rather than implied — a stalled socket
            silently showing old prices would be worse than saying so. */}
        {status === "live" ? (
          <Badge tone="success" className="gap-1">
            <Radio aria-hidden className="size-2.5" />
            {t("chartLive")}
          </Badge>
        ) : status === "polling" ? (
          <Badge tone="warning" className="gap-1">
            <Activity aria-hidden className="size-2.5" />
            {t("chartPolling")}
          </Badge>
        ) : status === "error" ? (
          <Badge tone="danger">{t("chartError")}</Badge>
        ) : null}
      </div>

      <LiveChart
        candles={candles}
        rising={rising}
        className="mt-3 h-[168px] w-full"
      />

      <p className="mt-1 text-[10px] text-[var(--subtle)]">
        {t("chartFooter")}
      </p>
    </div>
  );
}
