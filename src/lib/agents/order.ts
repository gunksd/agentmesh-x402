/**
 * Order preview.
 *
 * Turns the report's directional call into concrete order parameters — the exact
 * payload an Agent OS `trade` scope call would carry — and stops there.
 *
 * Stopping there is the design, not a shortcut. Binance's MCP docs are explicit
 * that every order is restated and waits for user approval, and this project
 * requests read-only scopes, so there is no code path that could submit. What the
 * mesh sells is the decision; the human keeps the trigger.
 *
 * Sizing comes from the risk agent's measured volatility rather than a fixed
 * fraction, so a violent market produces a smaller order on its own.
 */

import type { DepthResult, Direction, RiskResult } from "./analysis";
import type { LocalisedText } from "@/lib/i18n/types";

export type OrderSide = "BUY" | "SELL";

/**
 * Why no order was proposed.
 *
 * `no_edge` is a real conclusion; `missing_depth` is a gap in the inputs. The UI
 * must not conflate them — reporting "no directional edge" when the depth agent
 * simply failed to get paid contradicts a report that says "short bias at 58%".
 */
export type NoOrderReason = "no_edge" | "missing_depth";

export interface OrderPreview {
  symbol: string;
  side: OrderSide;
  type: "LIMIT";
  /** Base-asset quantity, rounded to a sane number of significant digits. */
  quantity: number;
  /** Limit price, placed inside the spread to avoid crossing it. */
  price: number;
  notionalUsd: number;
  leverage: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  /** Why this size and these levels, in one line each, in both languages. */
  rationale: LocalisedText[];
  /** What would need to be granted for this to execute. */
  requiredScope: "trade";
  status: "awaiting_human_approval";
}

/** Rounds to a fixed number of significant digits for a readable quantity. */
function toSignificant(value: number, digits = 5): number {
  if (value === 0 || !Number.isFinite(value)) return 0;
  const magnitude = Math.ceil(Math.log10(Math.abs(value)));
  const factor = 10 ** (digits - magnitude);
  return Math.round(value * factor) / factor;
}

/** Either an order, or the reason there isn't one. */
export type OrderOutcome =
  | { order: OrderPreview; reason?: undefined }
  | { order: null; reason: NoOrderReason };

/**
 * Builds a preview, or explains why it could not.
 *
 * A neutral call produces no order: the honest output of "no edge" is no trade,
 * and manufacturing one would undercut the report it came from. A missing order
 * book is a different situation entirely — the limit price is derived from the
 * spread, so without depth there is nothing to price against even when the
 * direction is clear. The two are reported separately so the UI can say which
 * happened.
 */
export function previewOrder(
  symbol: string,
  direction: Direction,
  confidence: number,
  budgetUsd: number,
  depth?: DepthResult,
  risk?: RiskResult,
): OrderOutcome {
  if (direction === "neutral") return { order: null, reason: "no_edge" };

  if (!depth || depth.bestBid <= 0 || depth.bestAsk <= 0) {
    return { order: null, reason: "missing_depth" };
  }

  const side: OrderSide = direction === "long" ? "BUY" : "SELL";

  // Rest inside the spread rather than crossing it — a taker fill would give up
  // the edge the depth analysis just measured.
  const price =
    side === "BUY"
      ? depth.bestBid + (depth.bestAsk - depth.bestBid) * 0.25
      : depth.bestAsk - (depth.bestAsk - depth.bestBid) * 0.25;

  // Scale exposure by conviction, then cap by the risk agent's leverage ceiling.
  const leverage = risk ? Math.min(risk.suggestedMaxLeverage, 3) : 1;
  const notionalUsd = Math.max(
    10,
    Math.min(budgetUsd, budgetUsd * confidence * leverage),
  );

  const quantity = toSignificant(notionalUsd / price);

  // Stop distance tracks measured volatility; a fixed percentage would be too
  // tight in a fast market and pointlessly wide in a quiet one.
  const dailyVol = risk ? risk.annualisedVolatility / Math.sqrt(365) : 0.02;
  const stopDistance = Math.max(0.004, Math.min(0.08, dailyVol * 1.5));

  const stopLossPrice =
    side === "BUY" ? price * (1 - stopDistance) : price * (1 + stopDistance);

  // Target twice the risk taken, so the preview carries a positive expectancy
  // rather than an arbitrary round number.
  const takeProfitPrice =
    side === "BUY"
      ? price * (1 + stopDistance * 2)
      : price * (1 - stopDistance * 2);

  const conviction = (confidence * 100).toFixed(0);
  const budget = budgetUsd.toLocaleString();
  const spread = depth.spreadBps.toFixed(1);
  const slippage = depth.slippageBuyBps.toFixed(1);

  const rationale: LocalisedText[] = [
    {
      en:
        `${side} sized at ${conviction}% conviction against a ` +
        `$${budget} budget.`,
      zh:
        `${side === "BUY" ? "买入" : "卖出"}，按 ${conviction}% 把握度对 ` +
        `${budget} 美元预算定量。`,
    },
    {
      en:
        `Limit rests inside a ${spread}bps spread to avoid paying ` +
        `${slippage}bps of taker slippage.`,
      zh:
        `限价挂在 ${spread}bps 价差内侧，避免付出 ${slippage}bps 的主动成交滑点。`,
    },
  ];

  if (risk) {
    const stopPercent = (stopDistance * 100).toFixed(2);
    const vol = (risk.annualisedVolatility * 100).toFixed(0);
    const lev = leverage.toFixed(1);

    const verdict: LocalisedText =
      risk.verdict === "low"
        ? { en: "low", zh: "低" }
        : risk.verdict === "moderate"
          ? { en: "moderate", zh: "中等" }
          : risk.verdict === "elevated"
            ? { en: "elevated", zh: "偏高" }
            : { en: "high", zh: "高" };

    rationale.push({
      en:
        `Stop at ${stopPercent}% reflects ${vol}% annualised volatility ` +
        `(${verdict.en} risk); leverage capped at ${lev}x.`,
      zh:
        `${stopPercent}% 的止损距离对应 ${vol}% 的年化波动率` +
        `（${verdict.zh}风险）；杠杆上限 ${lev} 倍。`,
    });
  }

  return {
    order: {
      symbol,
      side,
      type: "LIMIT",
      quantity,
      price: toSignificant(price, 8),
      notionalUsd: Math.round(notionalUsd),
      leverage,
      stopLossPrice: toSignificant(stopLossPrice, 8),
      takeProfitPrice: toSignificant(takeProfitPrice, 8),
      rationale,
      requiredScope: "trade",
      status: "awaiting_human_approval",
    },
  };
}
