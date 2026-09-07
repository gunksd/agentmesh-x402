/**
 * Early-signal scoring and A–E grading.
 *
 * The premise: price alone says what happened, price paired with open interest
 * says who is behind it. Four regimes fall out of the two signs, and they carry
 * genuinely different information:
 *
 *   price up   + OI up    long build-up — fresh money, the most tradable
 *   price down + OI up    short build-up — fresh bearish positioning
 *   price up   + OI down  short squeeze — covering, tends to exhaust
 *   price down + OI down  long unwind — capitulation, tends to exhaust
 *
 * The grade weights conviction signals over headline movement, because a 5% move
 * on falling OI is a different trade from a 2% move on rising OI plus taker
 * pressure. Anything the data cannot support scores zero rather than guessing.
 */

import type { LocalisedText } from "@/lib/i18n/types";
import type { OpenInterestPoint, RatioPoint } from "./futures";

export type Grade = "A" | "B" | "C" | "D" | "E";

export type Regime =
  | "long-buildup"
  | "short-buildup"
  | "short-squeeze"
  | "long-unwind"
  | "quiet";

export interface SignalComponent {
  key: string;
  label: LocalisedText;
  /** Contribution to the composite, 0..1 before weighting. */
  score: number;
  weight: number;
  /** Human-readable measurement. */
  detail: LocalisedText;
  /**
   * False when the underlying data was not available.
   *
   * These are excluded from the composite rather than scored zero. Book imbalance
   * is the case that forced this: the scanner runs in parallel with the depth
   * agent, so it never has that input, and counting it as a zero silently
   * docked every grade by its full weight.
   */
  available: boolean;
}

export interface SignalReport {
  grade: Grade;
  /** Composite score, 0..100. */
  score: number;
  regime: Regime;
  regimeLabel: LocalisedText;
  regimeNote: LocalisedText;
  components: SignalComponent[];
  /** Present when futures data was unavailable for this symbol. */
  degraded: boolean;
}

export interface SignalInput {
  symbol: string;
  changePercent24h: number;
  openInterest: OpenInterestPoint[];
  fundingRate?: number;
  takerRatio: RatioPoint[];
  topTraderRatio: RatioPoint[];
  /** Annualised realised volatility from the risk agent. */
  annualisedVolatility?: number;
  /** Signed orderbook imbalance in [-1, 1]. */
  imbalance?: number;
}

/** Percentage change between the first and last points of a series. */
function seriesChange(points: { openInterest: number }[]): number {
  if (points.length < 2) return 0;
  const first = points[0].openInterest;
  const last = points[points.length - 1].openInterest;
  if (first <= 0) return 0;
  return ((last - first) / first) * 100;
}

/**
 * Z-score of the latest value against the series.
 *
 * This is what makes a reading "anomalous" rather than merely large: a 3% OI jump
 * is unremarkable on a pair that routinely moves 5%, and significant on one that
 * usually moves 0.5%.
 */
function latestZScore(values: number[]): number {
  if (values.length < 8) return 0;

  const history = values.slice(0, -1);
  const latest = values[values.length - 1];

  const mean = history.reduce((sum, v) => sum + v, 0) / history.length;
  const variance =
    history.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (history.length - 1);
  const sd = Math.sqrt(variance);

  if (sd === 0) return 0;
  return (latest - mean) / sd;
}

/** Maps a value onto 0..1 with a soft knee at `full`. */
function ramp(value: number, full: number): number {
  if (full === 0) return 0;
  return Math.min(1, Math.abs(value) / full);
}

function classifyRegime(
  priceChange: number,
  oiChange: number,
): { regime: Regime; label: LocalisedText; note: LocalisedText } {
  // Below these thresholds neither series is saying anything worth naming.
  const priceQuiet = Math.abs(priceChange) < 0.6;
  const oiQuiet = Math.abs(oiChange) < 0.8;

  if (priceQuiet && oiQuiet) {
    return {
      regime: "quiet",
      label: { en: "Quiet", zh: "平静" },
      note: {
        en: "Neither price nor open interest is moving enough to read a regime.",
        zh: "价格与持仓量的变动都不足以判定明确的市场状态。",
      },
    };
  }

  const priceUp = priceChange >= 0;
  const oiUp = oiChange >= 0;

  if (priceUp && oiUp) {
    return {
      regime: "long-buildup",
      label: { en: "Long build-up", zh: "多头建仓" },
      note: {
        en: "Price and open interest rising together — fresh long positioning rather than short covering, which is the more sustainable of the two.",
        zh: "价格与持仓量同步上升——是新增多头建仓而非空头回补，两者之中前者更具延续性。",
      },
    };
  }

  if (!priceUp && oiUp) {
    return {
      regime: "short-buildup",
      label: { en: "Short build-up", zh: "空头建仓" },
      note: {
        en: "Price falling while open interest rises — new short positions being opened, not longs closing out.",
        zh: "价格下跌而持仓量上升——是新开空头仓位，而非多头平仓离场。",
      },
    };
  }

  if (priceUp && !oiUp) {
    return {
      regime: "short-squeeze",
      label: { en: "Short squeeze", zh: "空头挤压" },
      note: {
        en: "Price up on falling open interest — shorts covering. Moves like this exhaust once the forced buyers are done.",
        zh: "价格上涨伴随持仓量下降——空头正在回补。这类行情在被迫买盘出清后往往后继无力。",
      },
    };
  }

  return {
    regime: "long-unwind",
    label: { en: "Long unwind", zh: "多头平仓" },
    note: {
      en: "Price and open interest falling together — longs capitulating rather than shorts pressing, which tends to burn out.",
      zh: "价格与持仓量同步下降——是多头认赔离场而非空头加压，这类下跌通常会自行衰竭。",
    },
  };
}

/** Score bands. Deliberately strict: A should be rare enough to mean something. */
function toGrade(score: number): Grade {
  if (score >= 78) return "A";
  if (score >= 62) return "B";
  if (score >= 44) return "C";
  if (score >= 26) return "D";
  return "E";
}

export function scoreSignals(input: SignalInput): SignalReport {
  const components: SignalComponent[] = [];
  const degraded = input.openInterest.length < 8;

  const oiChange = seriesChange(input.openInterest);
  const oiZ = latestZScore(input.openInterest.map((p) => p.openInterest));

  // 1. Open interest momentum — the core early signal.
  const oiScore = ramp(oiChange, 6);
  components.push({
    key: "oi-change",
    label: { en: "Open interest trend", zh: "持仓量趋势" },
    score: oiScore,
    weight: 0.26,
    available: !degraded,
    detail: {
      en: degraded
        ? "No futures market for this symbol."
        : `${oiChange >= 0 ? "+" : ""}${oiChange.toFixed(2)}% over the window.`,
      zh: degraded
        ? "该交易对没有对应的合约市场。"
        : `窗口内变动 ${oiChange >= 0 ? "+" : ""}${oiChange.toFixed(2)}%。`,
    },
  });

  // 2. Anomaly magnitude — is the latest reading unusual for this pair?
  const anomalyScore = ramp(oiZ, 2.5);
  components.push({
    key: "oi-anomaly",
    label: { en: "OI anomaly", zh: "持仓量异动" },
    score: anomalyScore,
    weight: 0.22,
    available: !degraded,
    detail: {
      en: degraded
        ? "Not measurable without open interest history."
        : `Latest reading is ${oiZ >= 0 ? "+" : ""}${oiZ.toFixed(2)}σ from its recent mean.`,
      zh: degraded
        ? "缺少持仓量历史，无法测算。"
        : `最新读数偏离近期均值 ${oiZ >= 0 ? "+" : ""}${oiZ.toFixed(2)}σ。`,
    },
  });

  // 3. Taker pressure — aggressive flow confirms or contradicts the move.
  const takerLatest = input.takerRatio.at(-1)?.ratio;
  const takerScore =
    takerLatest === undefined ? 0 : ramp(takerLatest - 1, 0.35);
  components.push({
    key: "taker",
    label: { en: "Taker pressure", zh: "主动成交压力" },
    score: takerScore,
    weight: 0.18,
    available: takerLatest !== undefined,
    detail: {
      en:
        takerLatest === undefined
          ? "No taker flow data."
          : `Buy/sell ratio ${takerLatest.toFixed(3)} — ${
              takerLatest >= 1 ? "buyers" : "sellers"
            } are the aggressors.`,
      zh:
        takerLatest === undefined
          ? "无主动成交数据。"
          : `买卖比 ${takerLatest.toFixed(3)}——${
              takerLatest >= 1 ? "买方" : "卖方"
            }为主动方。`,
    },
  });

  // 4. Funding — crowding tax. Extreme funding marks a crowded side.
  const funding = input.fundingRate;
  const fundingBps = funding === undefined ? 0 : funding * 10_000;
  const fundingScore = funding === undefined ? 0 : ramp(fundingBps, 5);
  components.push({
    key: "funding",
    label: { en: "Funding skew", zh: "资金费率偏斜" },
    score: fundingScore,
    weight: 0.14,
    available: funding !== undefined,
    detail: {
      en:
        funding === undefined
          ? "No funding rate available."
          : `${fundingBps >= 0 ? "+" : ""}${fundingBps.toFixed(2)}bps — ${
              fundingBps >= 0 ? "longs" : "shorts"
            } are paying.`,
      zh:
        funding === undefined
          ? "无资金费率数据。"
          : `${fundingBps >= 0 ? "+" : ""}${fundingBps.toFixed(2)}bps——${
              fundingBps >= 0 ? "多头" : "空头"
            }在付费。`,
    },
  });

  // 5. Top-trader positioning — where size is leaning.
  const topLatest = input.topTraderRatio.at(-1)?.ratio;
  const topScore = topLatest === undefined ? 0 : ramp(topLatest - 1, 0.5);
  components.push({
    key: "top-traders",
    label: { en: "Top trader skew", zh: "大户持仓偏斜" },
    score: topScore,
    weight: 0.1,
    available: topLatest !== undefined,
    detail: {
      en:
        topLatest === undefined
          ? "No top trader data."
          : `Long/short ratio ${topLatest.toFixed(3)} among the largest accounts.`,
      zh:
        topLatest === undefined
          ? "无大户持仓数据。"
          : `最大持仓账户的多空比为 ${topLatest.toFixed(3)}。`,
    },
  });

  // 6. Book imbalance — the spot-side confirmation, if the depth agent ran.
  const imbalanceScore =
    input.imbalance === undefined ? 0 : ramp(input.imbalance, 0.3);
  components.push({
    key: "imbalance",
    label: { en: "Book imbalance", zh: "盘口失衡" },
    score: imbalanceScore,
    weight: 0.1,
    available: input.imbalance !== undefined,
    detail: {
      en:
        input.imbalance === undefined
          ? "Depth agent did not report."
          : `${(input.imbalance * 100).toFixed(1)}% signed imbalance toward ${
              input.imbalance >= 0 ? "bids" : "asks"
            }.`,
      zh:
        input.imbalance === undefined
          ? "盘口 Agent 未返回数据。"
          : `有向失衡 ${(input.imbalance * 100).toFixed(1)}%，偏向${
              input.imbalance >= 0 ? "买盘" : "卖盘"
            }。`,
    },
  });

  // Score against the weight actually available, not the full 1.0. Otherwise a
  // spot-only pair or a parallel-agent gap reads as weak signal rather than as
  // absent data.
  const availableWeight = components.reduce(
    (sum, c) => (c.available ? sum + c.weight : sum),
    0,
  );
  const weighted =
    availableWeight > 0
      ? components.reduce(
          (sum, c) => (c.available ? sum + c.score * c.weight : sum),
          0,
        ) / availableWeight
      : 0;

  // Volatility discount: the same signal on a wildly volatile pair is worth less,
  // because the noise floor is higher.
  const volatilityPenalty =
    input.annualisedVolatility !== undefined
      ? Math.min(0.18, input.annualisedVolatility / 6)
      : 0;

  const score = Math.round(
    Math.max(0, Math.min(1, weighted - volatilityPenalty)) * 100,
  );

  const { regime, label, note } = classifyRegime(
    input.changePercent24h,
    oiChange,
  );

  return {
    grade: toGrade(score),
    score,
    regime,
    regimeLabel: label,
    regimeNote: note,
    components,
    degraded,
  };
}
