/**
 * Analysis performed by each agent.
 *
 * Deterministic maths over live market data rather than model output, for two
 * reasons: results are reproducible when a reviewer re-runs the demo, and each
 * agent stays fast enough that the payment step dominates the timeline — which
 * is the thing this project is actually demonstrating.
 */

import { realisedVolatility, type OrderBook } from "./market";
import type { NoOrderReason, OrderPreview } from "./order";
import type { LocalisedText } from "@/lib/i18n/types";
import {
  fetchFunding,
  fetchOpenInterestHistory,
  fetchTakerRatio,
  fetchTopTraderRatio,
} from "./futures";
import { scoreSignals, type Regime, type SignalReport } from "./signals";
import {
  fetchKlines,
  fetchOrderBook,
  fetchTicker,
  type DataSource,
} from "@/lib/mcp/market";

export type Direction = "long" | "short" | "neutral";

/** Where an agent's inputs came from, reported so the UI need not assume. */
export interface Provenance {
  source: DataSource;
  /** MCP tool name, when served over MCP. */
  tool?: string;
}

export interface MarketDataResult {
  symbol: string;
  price: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  quoteVolume24h: number;
  /** Where price sits inside the 24h range, 0 at the low and 1 at the high. */
  rangePosition: number;
  provenance: Provenance;
}

export async function analyseMarketData(
  symbol: string,
): Promise<MarketDataResult> {
  const { data: ticker, source, tool } = await fetchTicker(symbol);

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
    provenance: { source, tool },
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
  provenance: Provenance;
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
  const { data: book, source, tool } = await fetchOrderBook(symbol, limit);

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
    provenance: { source, tool },
  };
}

export interface SentimentResult {
  symbol: string;
  /** Composite score in [-1, 1]. */
  score: number;
  label: "bearish" | "neutral" | "bullish";
  drivers: { name: string; contribution: number; note: string }[];
  provenance: Provenance;
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
  const [tickerResult, klineResult] = await Promise.all([
    fetchTicker(symbol),
    fetchKlines(symbol, window, 48),
  ]);

  const ticker = tickerResult.data;
  const klines = klineResult.data;

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
    // Both inputs share a path; report the ticker's, which drives most of the score.
    provenance: { source: tickerResult.source, tool: tickerResult.tool },
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
  provenance: Provenance;
}

export async function analyseRisk(
  symbol: string,
  notionalUsd = 10_000,
): Promise<RiskResult> {
  const { data: klines, source, tool } = await fetchKlines(symbol, "1h", 168);
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
    provenance: { source, tool },
  };
}

export interface SignalsResult extends SignalReport {
  symbol: string;
  period: string;
  /** Latest open interest notional, for display. */
  openInterestUsd?: number;
  /** Series for the sparkline, oldest first. */
  openInterestSeries: { timestamp: number; value: number }[];
}

/**
 * Runs the early-signal scan.
 *
 * Every futures call is wrapped so a symbol without a futures market degrades to
 * a graded-but-thin report rather than failing the agent. Plenty of Alpha pairs
 * are spot-only, and a scanner that 500s on those is useless for the long tail
 * where early signals actually matter.
 */
export async function analyseSignals(
  symbol: string,
  period = "1h",
): Promise<SignalsResult> {
  const [openInterest, funding, takerRatio, topTraderRatio, klines] =
    await Promise.all([
      fetchOpenInterestHistory(symbol, period, 48).catch(() => []),
      fetchFunding(symbol).catch(() => null),
      fetchTakerRatio(symbol, period, 24).catch(() => []),
      fetchTopTraderRatio(symbol, period, 24).catch(() => []),
      fetchKlines(symbol, "1h", 48).catch(() => ({ data: [], source: "rest" as const })),
    ]);

  const ticker = await fetchTicker(symbol).catch(() => null);
  const changePercent24h = ticker ? Number(ticker.data.priceChangePercent) : 0;

  const report = scoreSignals({
    symbol,
    changePercent24h,
    openInterest,
    fundingRate: funding?.lastFundingRate,
    takerRatio,
    topTraderRatio,
    annualisedVolatility: realisedVolatility(klines.data),
  });

  return {
    ...report,
    symbol,
    period,
    openInterestUsd: openInterest.at(-1)?.notionalUsd,
    openInterestSeries: openInterest.map((point) => ({
      timestamp: point.timestamp,
      value: point.openInterest,
    })),
  };
}

export interface ReportResult {
  symbol: string;
  direction: Direction;
  /** Model confidence in [0, 1]. */
  confidence: number;
  /**
   * Prose is emitted in both languages rather than translated in the browser.
   * The report is generated server-side from numbers the client never sees, so
   * producing one language would mean either shipping the raw findings to the
   * client or losing the other language entirely.
   */
  headline: LocalisedText;
  narrative: LocalisedText[];
  levels: { label: LocalisedText; value: number }[];
  /**
   * Order parameters awaiting human approval. Attached by the report route
   * rather than composeReport, which stays a pure function over findings.
   */
  orderPreview?: OrderPreview | null;
  /** Why no order was proposed, when `orderPreview` is null. */
  noOrderReason?: NoOrderReason | null;
}

export interface ReportInput {
  market?: MarketDataResult;
  depth?: DepthResult;
  sentiment?: SentimentResult;
  risk?: RiskResult;
  signals?: SignalsResult;
}

/**
 * Direction implied by a market regime.
 *
 * Build-ups point with the flow because fresh positioning tends to continue.
 * Squeezes and unwinds point against it: both are closing activity, and once the
 * forced participants are done there is nobody left to push.
 */
function regimeBias(regime: Regime): number {
  switch (regime) {
    case "long-buildup":
      return 1;
    case "short-buildup":
      return -1;
    case "short-squeeze":
      return -0.45;
    case "long-unwind":
      return 0.45;
    default:
      return 0;
  }
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
    signals.push({ weight: 0.22, value: input.sentiment.score });
  }
  // Open interest carries the most weight: it is the only input describing
  // whether money is entering or leaving, which the other agents cannot see.
  if (input.signals && !input.signals.degraded) {
    signals.push({
      weight: 0.3,
      value: regimeBias(input.signals.regime) * (input.signals.score / 100),
    });
  }
  if (input.depth) {
    signals.push({ weight: 0.3, value: input.depth.imbalance });
  }
  if (input.market) {
    signals.push({
      weight: 0.18,
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

  const narrative: LocalisedText[] = [];

  if (input.market) {
    const price = input.market.price.toLocaleString();
    const change = Math.abs(input.market.changePercent24h).toFixed(2);
    const rising = input.market.changePercent24h >= 0;
    const position = (input.market.rangePosition * 100).toFixed(0);

    narrative.push({
      en:
        `${symbol} trades at ${price}, ${rising ? "up" : "down"} ${change}% ` +
        `over 24h and sitting at ${position}% of the daily range.`,
      zh:
        `${symbol} 现价 ${price}，24 小时${rising ? "上涨" : "下跌"} ${change}%，` +
        `处于日内区间的 ${position}% 位置。`,
    });
  }

  if (input.depth) {
    const bidShare = (input.depth.bidShare * 100).toFixed(1);
    const spread = input.depth.spreadBps.toFixed(1);
    const slip = input.depth.slippageBuyBps.toFixed(1);
    const bidHeavy = input.depth.imbalance >= 0;

    narrative.push({
      en:
        `Depth is skewed toward ${bidHeavy ? "bids" : "asks"} at ${bidShare}% ` +
        `bid share, with a ${spread}bps spread. A $100k market buy would slip ` +
        `roughly ${slip}bps.`,
      zh:
        `盘口偏向${bidHeavy ? "买盘" : "卖盘"}，买盘占比 ${bidShare}%，` +
        `价差 ${spread}bps。10 万美元市价买入约滑点 ${slip}bps。`,
    });
  }

  if (input.sentiment) {
    const score = input.sentiment.score.toFixed(2);
    const label: LocalisedText =
      input.sentiment.label === "bullish"
        ? { en: "bullish", zh: "偏多" }
        : input.sentiment.label === "bearish"
          ? { en: "bearish", zh: "偏空" }
          : { en: "neutral", zh: "中性" };

    narrative.push({
      en: `Momentum reads ${label.en} at a composite score of ${score}.`,
      zh: `动量读数${label.zh}，综合评分 ${score}。`,
    });
  }

  if (input.risk) {
    const vol = (input.risk.annualisedVolatility * 100).toFixed(1);
    const notional = input.risk.notionalUsd.toLocaleString();
    const varUsd = input.risk.valueAtRisk95.toFixed(0);
    const leverage = input.risk.suggestedMaxLeverage.toFixed(1);

    const verdict: LocalisedText =
      input.risk.verdict === "low"
        ? { en: "low", zh: "低" }
        : input.risk.verdict === "moderate"
          ? { en: "moderate", zh: "中等" }
          : input.risk.verdict === "elevated"
            ? { en: "elevated", zh: "偏高" }
            : { en: "high", zh: "高" };

    narrative.push({
      en:
        `Realised volatility is ${vol}% annualised (${verdict.en} risk). ` +
        `One-day 95% VaR on a $${notional} position is $${varUsd}; ` +
        `cap leverage near ${leverage}x.`,
      zh:
        `已实现波动率年化 ${vol}%（${verdict.zh}风险）。` +
        `${notional} 美元仓位的单日 95% VaR 为 ${varUsd} 美元；` +
        `杠杆建议不超过 ${leverage} 倍。`,
    });
  }

  const levels: { label: LocalisedText; value: number }[] = [];
  if (input.market) {
    levels.push(
      { label: { en: "24h high", zh: "24 小时高点" }, value: input.market.high24h },
      { label: { en: "Spot", zh: "现价" }, value: input.market.price },
      { label: { en: "24h low", zh: "24 小时低点" }, value: input.market.low24h },
    );
  }
  if (input.depth) {
    for (const wall of input.depth.walls.slice(0, 2)) {
      const ratio = wall.ratio.toFixed(1);
      const isBid = wall.side === "bid";
      levels.push({
        label: {
          en: `${isBid ? "Bid" : "Ask"} wall (${ratio}x)`,
          zh: `${isBid ? "买盘" : "卖盘"}墙（${ratio}x）`,
        },
        value: wall.price,
      });
    }
  }

  const confidencePercent = (confidence * 100).toFixed(0);
  const headline: LocalisedText =
    direction === "neutral"
      ? {
          en: `${symbol}: no directional edge, stand aside`,
          zh: `${symbol}：无方向性边际，建议观望`,
        }
      : {
          en: `${symbol}: ${direction} bias at ${confidencePercent}% confidence`,
          zh: `${symbol}：${direction === "long" ? "偏多" : "偏空"}，置信度 ${confidencePercent}%`,
        };

  return { symbol, direction, confidence, headline, narrative, levels };
}
