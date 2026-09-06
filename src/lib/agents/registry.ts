/**
 * The agent catalog.
 *
 * Each entry is a paid HTTP endpoint: an agent that sells one capability and
 * charges per request over x402. The orchestrator composes them at runtime,
 * paying each one as it goes.
 *
 * Prices are in USD and converted to atomic token units at request time, so the
 * same catalog works against a 6-decimal test token or 18-decimal mainnet USDC.
 */

import { SETTLEMENT_TOKEN } from "@/lib/chain";

export type AgentSkill =
  | "market-data"
  | "orderbook-depth"
  | "sentiment"
  | "risk"
  | "report";

export interface AgentDefinition {
  skill: AgentSkill;
  name: string;
  /** One line shown in the UI and published to the B402 Bazaar. */
  description: string;
  /** Price per call in USD. */
  priceUsd: number;
  /** Whether this agent fetches live Binance market data to do its work. */
  readsLiveMarket: boolean;
  /** Shown in the node graph. */
  accent: "market" | "depth" | "sentiment" | "risk" | "report";
  /** Inputs the agent accepts, surfaced in the Bazaar listing schema. */
  inputs: Record<string, string>;
}

export const AGENTS: Record<AgentSkill, AgentDefinition> = {
  "market-data": {
    skill: "market-data",
    name: "Market Data Agent",
    description:
      "Live spot price, 24h range and funding for any Binance trading pair.",
    priceUsd: 0.01,
    readsLiveMarket: true,
    accent: "market",
    inputs: { symbol: "Trading pair, e.g. BTCUSDT" },
  },
  "orderbook-depth": {
    skill: "orderbook-depth",
    name: "Orderbook Depth Agent",
    description:
      "Bid/ask imbalance, liquidity walls and slippage estimates from live depth.",
    priceUsd: 0.02,
    readsLiveMarket: true,
    accent: "depth",
    inputs: { symbol: "Trading pair", depth: "Levels to analyse" },
  },
  sentiment: {
    skill: "sentiment",
    // Named for the role it plays in the mesh. The signal is momentum-derived
    // from price and volume, not scraped from news or social feeds.
    name: "Momentum Agent",
    description:
      "Composite momentum score from 24h return, range position and volume trend.",
    priceUsd: 0.015,
    readsLiveMarket: true,
    accent: "sentiment",
    inputs: { symbol: "Asset ticker", window: "Lookback window" },
  },
  risk: {
    skill: "risk",
    name: "Risk Agent",
    description:
      "Position sizing, liquidation distance and volatility-adjusted exposure.",
    priceUsd: 0.02,
    readsLiveMarket: true,
    accent: "risk",
    inputs: { symbol: "Trading pair", notional: "Position size in USD" },
  },
  report: {
    skill: "report",
    name: "Report Writer Agent",
    description:
      "Synthesises upstream agent output into a single directional briefing.",
    priceUsd: 0.05,
    readsLiveMarket: false,
    accent: "report",
    inputs: { findings: "Structured output from upstream agents" },
  },
};

export const AGENT_LIST = Object.values(AGENTS);

export function isAgentSkill(value: string): value is AgentSkill {
  return value in AGENTS;
}

/** Converts a USD price into atomic units of the settlement token. */
export function priceToAtomic(priceUsd: number): string {
  const scaled = Math.round(priceUsd * 10 ** SETTLEMENT_TOKEN.decimals);
  return String(scaled);
}

/** Formats atomic units back to a human string for display. */
export function formatAtomic(atomic: string): string {
  const value = Number(atomic) / 10 ** SETTLEMENT_TOKEN.decimals;
  return value.toFixed(Math.min(4, SETTLEMENT_TOKEN.decimals));
}

/** Total cost of one full pipeline run. */
export const PIPELINE_TOTAL_USD = AGENT_LIST.reduce(
  (sum, agent) => sum + agent.priceUsd,
  0,
);
