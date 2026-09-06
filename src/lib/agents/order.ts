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

export type OrderSide = "BUY" | "SELL";

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
  /** Why this size and these levels, in one line each. */
  rationale: string[];
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

/**
 * Builds a preview, or returns null when there is nothing worth proposing.
 *
 * A neutral call produces no order: the honest output of "no edge" is no trade,
 * and manufacturing one would undercut the report it came from.
 */
export function previewOrder(
  symbol: string,
  direction: Direction,
  confidence: number,
  budgetUsd: number,
  depth?: DepthResult,
  risk?: RiskResult,
): OrderPreview | null {
  if (direction === "neutral") return null;
  if (!depth || depth.bestBid <= 0 || depth.bestAsk <= 0) return null;

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

  const rationale = [
    `${side} sized at ${(confidence * 100).toFixed(0)}% conviction against a ` +
      `$${budgetUsd.toLocaleString()} budget.`,
    `Limit rests inside a ${depth.spreadBps.toFixed(1)}bps spread to avoid ` +
      `paying ${depth.slippageBuyBps.toFixed(1)}bps of taker slippage.`,
  ];

  if (risk) {
    rationale.push(
      `Stop at ${(stopDistance * 100).toFixed(2)}% reflects ` +
        `${(risk.annualisedVolatility * 100).toFixed(0)}% annualised volatility ` +
        `(${risk.verdict} risk); leverage capped at ${leverage.toFixed(1)}x.`,
    );
  }

  return {
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
  };
}
