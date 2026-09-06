/**
 * The orchestrator.
 *
 * Runs a five-agent pipeline where every hop is a paid HTTP call. It holds the
 * paying key and settles each invoice as it goes, emitting an event per protocol
 * step so the UI can render the payment flow live.
 *
 * Execution shape: the three market-reading agents are independent and run in
 * parallel; the report agent consumes their output so it runs last. Parallel
 * payment is the interesting property here — three settlements in flight at once
 * is what an agent economy actually looks like.
 */

import {
  AGENTS,
  PIPELINE_TOTAL_USD,
  priceToAtomic,
  type AgentSkill,
} from "./registry";
import { searchBazaar, listingPriceUsd } from "./bazaar";
import { paidFetch, PaymentError } from "@/lib/x402/client";
import { payerAddress } from "@/lib/x402/signer";
import { txUrl, SETTLEMENT_TOKEN } from "@/lib/chain";
import type { EventSink } from "./events";
import type {
  DepthResult,
  MarketDataResult,
  ReportResult,
  RiskResult,
  SentimentResult,
} from "./analysis";

/** Agents that read the market directly, paid in parallel. */
const PARALLEL_AGENTS = ["market-data", "orderbook-depth", "sentiment", "risk"] as const;

export const PIPELINE_PLAN: AgentSkill[] = [
  ...PARALLEL_AGENTS,
  "report",
];

interface AgentEnvelope<T> {
  agent: string;
  paidBy: string;
  transaction?: string;
  data: T;
}

export interface OrchestrationOptions {
  symbol: string;
  notionalUsd: number;
  baseUrl: string;
  privateKey: `0x${string}`;
  emit: EventSink;
}

export interface OrchestrationSummary {
  settledCount: number;
  totalSpentUsd: number;
  report?: ReportResult;
}

/**
 * Pays one agent and reports each protocol step.
 *
 * Returns null on failure rather than throwing: one agent being unreachable
 * should degrade the report, not abort the run.
 */
async function invokeAgent<T>(
  skill: AgentSkill,
  url: string,
  options: OrchestrationOptions,
  init: RequestInit = {},
): Promise<AgentEnvelope<T> | null> {
  const { emit, privateKey } = options;
  const startedAt = Date.now();

  try {
    const result = await paidFetch<AgentEnvelope<T>>(url, privateKey, init, {
      // Quote and signature come from the wire, not from local assumptions —
      // the 402 response is what the payer actually signed against.
      onQuote: (requirements) =>
        emit({
          type: "agent:quoted",
          skill,
          amount: requirements.amount,
          asset: SETTLEMENT_TOKEN.symbol,
          payTo: requirements.payTo,
        }),
      onSign: ({ payer, nonce, elapsedMs }) =>
        emit({ type: "agent:signed", skill, payer, nonce, elapsedMs }),
    });

    emit({
      type: "agent:settled",
      skill,
      transaction: result.settlement?.transaction,
      explorerUrl: result.settlement?.transaction
        ? txUrl(result.settlement.transaction)
        : undefined,
      elapsedMs: result.timings.settledAt - result.timings.signedAt,
    });

    emit({
      type: "agent:delivered",
      skill,
      data: result.data.data,
      elapsedMs: Date.now() - startedAt,
    });

    return result.data;
  } catch (error) {
    emit({
      type: "agent:failed",
      skill,
      reason:
        error instanceof PaymentError
          ? error.reason
          : error instanceof Error
            ? error.message
            : "unknown_error",
    });
    return null;
  }
}

export async function runPipeline(
  options: OrchestrationOptions,
): Promise<OrchestrationSummary> {
  const { symbol, notionalUsd, baseUrl, emit } = options;
  const runId = crypto.randomUUID();
  const startedAt = Date.now();

  emit({ type: "run:start", runId, symbol, plan: PIPELINE_PLAN });

  // Discovery first, against Binance's live public Bazaar.
  const listings = await searchBazaar(`${symbol} price analysis`, {
    network: "eip155:56",
    limit: 6,
  });

  emit({
    type: "bazaar:discovered",
    count: listings.length,
    sample: listings.slice(0, 4).map((listing) => ({
      resource: listing.resource,
      description: listing.description,
      priceUsd: listingPriceUsd(listing),
    })),
  });

  const query = new URLSearchParams({ symbol });

  // Three independent agents, paid concurrently.
  const [market, depth, sentiment, risk] = await Promise.all([
    invokeAgent<MarketDataResult>(
      "market-data",
      `${baseUrl}/api/agents/market-data?${query}`,
      options,
    ),
    invokeAgent<DepthResult>(
      "orderbook-depth",
      `${baseUrl}/api/agents/orderbook-depth?${query}&depth=100`,
      options,
    ),
    invokeAgent<SentimentResult>(
      "sentiment",
      `${baseUrl}/api/agents/sentiment?${query}&window=1h`,
      options,
    ),
    invokeAgent<RiskResult>(
      "risk",
      `${baseUrl}/api/agents/risk?${query}&notional=${notionalUsd}`,
      options,
    ),
  ]);

  // The report agent is paid last because it consumes the others' output.
  const report = await invokeAgent<ReportResult>(
    "report",
    `${baseUrl}/api/agents/report`,
    options,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        symbol,
        findings: {
          market: market?.data,
          depth: depth?.data,
          sentiment: sentiment?.data,
          risk: risk?.data,
        },
      }),
    },
  );

  const settled = [market, depth, sentiment, risk, report].filter(Boolean);
  const { AGENTS } = await import("./registry");

  const totalSpentUsd = PIPELINE_PLAN.filter((skill, index) =>
    Boolean([market, depth, sentiment, risk, report][index]),
  ).reduce((sum, skill) => sum + AGENTS[skill].priceUsd, 0);

  emit({
    type: "run:complete",
    runId,
    totalSpentAtomic: priceToAtomic(totalSpentUsd),
    totalSpentUsd,
    settledCount: settled.length,
    elapsedMs: Date.now() - startedAt,
  });

  return {
    settledCount: settled.length,
    totalSpentUsd,
    report: report?.data,
  };
}

export { PIPELINE_TOTAL_USD };
