/**
 * Analysis performed by each agent.
 *
 * Deterministic maths over live market data rather than model output, for two
 * reasons: results are reproducible when a reviewer re-runs the demo, and each
 * agent stays fast enough that the payment step dominates the timeline — which
 * is the thing this project is actually demonstrating.
 */

import {
  fetchKlines,
  fetchOrderBook,
  fetchTicker,
  realisedVolatility,
  type OrderBook,
} from "./market";

export type Direction = "long" | "short" | "neutral";

export interface MarketDataResult {
  symbol: string;
  price: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  quoteVolume24h: number;
  /** Where price sits inside the 24h range, 0 at the low and 1 at the high. */
  rangePosition: number;
}

export async function analyseMarketData(
  symbol: string,
): Promise<MarketDataResult> {
  const ticker = await fetchTicker(symbol);

  const price = Number(ticker.lastPrice);
  const high = Number(ticker.highPrice);
  const low = Number(ticker.lowPrice);
  const span = high - low;

  return {
    symbol: ticker.symbol,
    price,
    changePercent24h: Number(ticker.priceChangePercent),
    high24h: high,
    low24h: low,
    quoteVolume24h: Number(ticker.quoteVolume),
    rangePosition: span > 0 ? (price - low) / span : 0.5,
  };
}

export interface LiquidityWall {
  price: number;
  quantity: number;
  side: "bid" | "ask";
  /** Multiple of the average level size at this depth. */
  ratio: number;
}

export interface DepthResult {
  symbol: string;
  bestBid: number;
  bestAsk: number;
  spreadBps: number;
  /** Bid share of total depth. Above 0.5 means bids dominate. */
  bidShare: number;
  /** Signed imbalance in [-1, 1]. Positive favours buyers. */
  imbalance: number;
  walls: LiquidityWall[];
  /** Estimated slippage in bps for a $100k market order each way. */
  slippageBuyBps: number;
  slippageSellBps: number;
}

/** Sums notional value across book levels. */
function notional(levels: [string, string][]): number {
  return levels.reduce(
    (sum, [price, qty]) => sum + Number(price) * Number(qty),
    0,
  );
}

/** Walks the book to estimate average fill price for a notional order. */
function estimateSlippageBps(
  levels: [string, string][],
  reference: number,
  targetNotional: number,
): number {
  let remaining = targetNotional;
  let filledNotional = 0;
  let filledQty = 0;

  for (const [priceStr, qtyStr] of levels) {
    if (remaining <= 0) break;
    const price = Number(priceStr);
    const available = price * Number(qtyStr);
    const take = Math.min(available, remaining);

    filledNotional += take;
    filledQty += take / price;
    remaining -= take;
  }

  // Book too thin to fill — report the depth we could measure.
  if (filledQty === 0) return 0;

  const averagePrice = filledNotional / filledQty;
  return Math.abs((averagePrice - reference) / reference) * 10_000;
}

/** Levels holding an outsized share of nearby liquidity. */
function findWalls(book: OrderBook, side: "bid" | "ask"): LiquidityWall[] {
  const levels = side === "bid" ? book.bids : book.asks;
  if (levels.length === 0) return [];

  const quantities = levels.map(([, qty]) => Number(qty));
  const average =
    quantities.reduce((sum, q) => sum + q, 0) / quantities.length || 1;

  return levels
    .map(([price, qty]) => ({
      price: Number(price),
      quantity: Number(qty),
      side,
      ratio: Number(qty) / average,
    }))
    .filter((level) => level.ratio >= 4)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 3);
}

export async function analyseDepth(
  symbol: string,
  limit = 100,
): Promise<DepthResult> {
  const book = await fetchOrderBook(symbol, limit);

  const bestBid = Number(book.bids[0]?.[0] ?? 0);
  const bestAsk = Number(book.asks[0]?.[0] ?? 0);
  const mid = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : 0;

  const bidNotional = notional(book.bids);
  const askNotional = notional(book.asks);
  const total = bidNotional + askNotional;
  const bidShare = total > 0 ? bidNotional / total : 0.5;

  return {
    symbol,
    bestBid,
    bestAsk,
    spreadBps: mid > 0 ? ((bestAsk - bestBid) / mid) * 10_000 : 0,
    bidShare,
    imbalance: bidShare * 2 - 1,
    walls: [...findWalls(book, "bid"), ...findWalls(book, "ask")],
    slippageBuyBps: estimateSlippageBps(book.asks, bestAsk, 100_000),
    slippageSellBps: estimateSlippageBps(book.bids, bestBid, 100_000),
  };
}

export interface SentimentResult {
  symbol: string;
  /** Composite score in [-1, 1]. */
  score: number;
  label: "bearish" | "neutral" | "bullish";
  drivers: { name: string; contribution: number; note: string }[];
}

/**
 * Momentum-derived sentiment.
 *
 * Blends 24h return, position in range, and whether recent volume is expanding.
 * Honest naming matters here: this reads price action, not social feeds. A
 * production build would add a news API behind the same paid interface.
 */
export async function analyseSentiment(
  symbol: string,
  window = "1h",
): Promise<SentimentResult> {
  const [ticker, klines] = await Promise.all([
    fetchTicker(symbol),
    fetchKlines(symbol, window, 48),
  ]);

  const change = Number(ticker.priceChangePercent);
  const momentum = Math.max(-1, Math.min(1, change / 5));

  const high = Number(ticker.highPrice);
  const low = Number(ticker.lowPrice);
  const price = Number(ticker.lastPrice);
  const span = high - low;
  const position = span > 0 ? (price - low) / span : 0.5;
  const positionScore = position * 2 - 1;

  const recent = klines.slice(-6);
  const earlier = klines.slice(-24, -6);
  const recentVolume =
    recent.reduce((sum, k) => sum + k.volume, 0) / (recent.length || 1);
  const earlierVolume =
    earlier.reduce((sum, k) => sum + k.volume, 0) / (earlier.length || 1);
  const volumeTrend =
    earlierVolume > 0
      ? Math.max(-1, Math.min(1, recentVolume / earlierVolume - 1))
      : 0;

  const score = momentum * 0.5 + positionScore * 0.3 + volumeTrend * 0.2;

  return {
    symbol,
    score,
    label: score > 0.15 ? "bullish" : score < -0.15 ? "bearish" : "neutral",
    drivers: [
      {
        name: "24h momentum",
        contribution: momentum * 0.5,
        note: `${change.toFixed(2)}% over 24h`,
      },
      {
        name: "Range position",
        contribution: positionScore * 0.3,
        note: `${(position * 100).toFixed(0)}% of the 24h range`,
      },
      {
        name: "Volume trend",
        contribution: volumeTrend * 0.2,
        note:
          volumeTrend >= 0
            ? `Recent volume up ${(volumeTrend * 100).toFixed(0)}%`
            : `Recent volume down ${(Math.abs(volumeTrend) * 100).toFixed(0)}%`,
      },
    ],
  };
}

export interface RiskResult {
  symbol: string;
  notionalUsd: number;
  annualisedVolatility: number;
  /** One-day 95% value at risk, in USD. */
  valueAtRisk95: number;
  /** Suggested max leverage given measured volatility. */
  suggestedMaxLeverage: number;
  liquidationDistancePercent: number;
  verdict: "low" | "moderate" | "elevated" | "high";
}

export async function analyseRisk(
  symbol: string,
  notionalUsd = 10_000,
): Promise<RiskResult> {
  const klines = await fetchKlines(symbol, "1h", 168);
  const annualised = realisedVolatility(klines);

  // Scale annual vol to a single day, then take the 95% one-tailed quantile.
  const daily = annualised / Math.sqrt(365);
  const valueAtRisk95 = notionalUsd * daily * 1.645;

  const suggestedMaxLeverage = annualised > 0
    ? Math.max(1, Math.min(10, 0.5 / daily))
    : 1;

  const liquidationDistancePercent = (1 / suggestedMaxLeverage) * 100;

  const verdict =
    annualised < 0.4
      ? "low"
      : annualised < 0.7
        ? "moderate"
        : annualised < 1.1
          ? "elevated"
          : "high";

  return {
    symbol,
    notionalUsd,
    annualisedVolatility: annualised,
    valueAtRisk95,
    suggestedMaxLeverage,
    liquidationDistancePercent,
    verdict,
  };
}

export interface ReportResult {
  symbol: string;
  direction: Direction;
  /** Model confidence in [0, 1]. */
  confidence: number;
  headline: string;
  narrative: string[];
  levels: { label: string; value: number }[];
}

export interface ReportInput {
  market?: MarketDataResult;
  depth?: DepthResult;
  sentiment?: SentimentResult;
  risk?: RiskResult;
}

/**
 * Combines upstream agent output into a directional call.
 *
 * Weights favour orderbook imbalance over headline momentum — depth is harder
 * to fake than a 24h percentage, and it is the input the other agents can't see.
 */
export function composeReport(
  symbol: string,
  input: ReportInput,
): ReportResult {
  const signals: { weight: number; value: number }[] = [];

  if (input.sentiment) {
    signals.push({ weight: 0.3, value: input.sentiment.score });
  }
  if (input.depth) {
    signals.push({ weight: 0.4, value: input.depth.imbalance });
  }
  if (input.market) {
    signals.push({
      weight: 0.3,
      value: Math.max(-1, Math.min(1, input.market.changePercent24h / 5)),
    });
  }

  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0) || 1;
  const composite =
    signals.reduce((sum, s) => sum + s.weight * s.value, 0) / totalWeight;

  const direction: Direction =
    composite > 0.12 ? "long" : composite < -0.12 ? "short" : "neutral";

  // High volatility should reduce conviction, not raise it.
  const volatilityPenalty = input.risk
    ? Math.min(0.35, input.risk.annualisedVolatility / 3)
    : 0;
  const confidence = Math.max(
    0.1,
    Math.min(0.95, Math.abs(composite) * 1.6 - volatilityPenalty + 0.25),
  );

  const narrative: string[] = [];

  if (input.market) {
    narrative.push(
      `${symbol} trades at ${input.market.price.toLocaleString()}, ` +
        `${input.market.changePercent24h >= 0 ? "up" : "down"} ` +
        `${Math.abs(input.market.changePercent24h).toFixed(2)}% over 24h and sitting at ` +
        `${(input.market.rangePosition * 100).toFixed(0)}% of the daily range.`,
    );
  }
  if (input.depth) {
    const side = input.depth.imbalance >= 0 ? "bids" : "asks";
    narrative.push(
      `Depth is skewed toward ${side} at ${(input.depth.bidShare * 100).toFixed(1)}% ` +
        `bid share, with a ${input.depth.spreadBps.toFixed(1)}bps spread. ` +
        `A $100k market buy would slip roughly ${input.depth.slippageBuyBps.toFixed(1)}bps.`,
    );
  }
  if (input.sentiment) {
    narrative.push(
      `Momentum reads ${input.sentiment.label} at a composite score of ` +
        `${input.sentiment.score.toFixed(2)}.`,
    );
  }
  if (input.risk) {
    narrative.push(
      `Realised volatility is ${(input.risk.annualisedVolatility * 100).toFixed(1)}% annualised ` +
        `(${input.risk.verdict} risk). One-day 95% VaR on a ` +
        `$${input.risk.notionalUsd.toLocaleString()} position is ` +
        `$${input.risk.valueAtRisk95.toFixed(0)}; cap leverage near ` +
        `${input.risk.suggestedMaxLeverage.toFixed(1)}x.`,
    );
  }

  const levels: { label: string; value: number }[] = [];
  if (input.market) {
    levels.push(
      { label: "24h high", value: input.market.high24h },
      { label: "Spot", value: input.market.price },
      { label: "24h low", value: input.market.low24h },
    );
  }
  if (input.depth) {
    for (const wall of input.depth.walls.slice(0, 2)) {
      levels.push({
        label: `${wall.side === "bid" ? "Bid" : "Ask"} wall (${wall.ratio.toFixed(1)}x)`,
        value: wall.price,
      });
    }
  }

  const headline =
    direction === "neutral"
      ? `${symbol}: no directional edge, stand aside`
      : `${symbol}: ${direction} bias at ${(confidence * 100).toFixed(0)}% confidence`;

  return { symbol, direction, confidence, headline, narrative, levels };
}
