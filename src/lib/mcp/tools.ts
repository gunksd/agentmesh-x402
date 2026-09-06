/**
 * Tool resolution for the Binance MCP server.
 *
 * Binance documents capability groups — market data, account, trade, transfer —
 * but publishes no tool names or signatures anywhere. `tools/list` against an
 * authorised session is the only source of truth, and the names could reasonably
 * be `get_ticker`, `getTicker`, `binance_ticker_24hr` or something else again.
 *
 * So rather than hardcode a guess that breaks on the first rename, this matches
 * tools by scoring their name and description against the capability we want.
 * The resolved map is cached per process, since the tool list is stable for the
 * life of a session.
 */

import { listTools, type McpTool } from "./client";

export type Capability = "ticker" | "orderbook" | "klines" | "balances";

/**
 * Scoring rules per capability.
 *
 * `required` terms must all appear somewhere in the name or description;
 * `boost` terms raise confidence when several tools qualify; `penalty` terms
 * push away near-misses — a "futures funding rate" tool should not win the
 * spot-ticker slot just because both mention price.
 */
const RULES: Record<
  Capability,
  { required: string[][]; boost: string[]; penalty: string[] }
> = {
  ticker: {
    // Either phrasing is acceptable: "ticker", or "price" plus a 24h qualifier.
    required: [["ticker"], ["price"], ["quote"]],
    boost: ["24h", "24hr", "symbol", "spot", "latest", "change"],
    penalty: ["funding", "index", "mark", "history", "average", "list"],
  },
  orderbook: {
    required: [["orderbook"], ["order", "book"], ["depth"]],
    boost: ["bids", "asks", "limit", "symbol", "level"],
    penalty: ["history", "trade", "open orders"],
  },
  klines: {
    required: [["kline"], ["candle"], ["ohlc"]],
    boost: ["interval", "symbol", "limit", "historical"],
    penalty: ["index", "mark"],
  },
  balances: {
    required: [["balance"], ["account"], ["position"]],
    boost: ["sub-account", "subaccount", "asset", "wallet", "free", "spot"],
    penalty: ["transfer", "history", "bill", "order"],
  },
};

function scoreTool(tool: McpTool, capability: Capability): number {
  const haystack = `${tool.name} ${tool.description ?? ""}`.toLowerCase();
  const rule = RULES[capability];

  // At least one required term group must match in full.
  const matchesRequirement = rule.required.some((group) =>
    group.every((term) => haystack.includes(term)),
  );
  if (!matchesRequirement) return 0;

  let score = 10;
  for (const term of rule.boost) {
    if (haystack.includes(term)) score += 2;
  }
  for (const term of rule.penalty) {
    if (haystack.includes(term)) score -= 4;
  }

  // Prefer tools whose name, not just description, signals the capability.
  if (tool.name.toLowerCase().includes(capability)) score += 3;

  return score;
}

export type ToolMap = Partial<Record<Capability, McpTool>>;

let cached: ToolMap | null = null;
let inFlight: Promise<ToolMap> | null = null;

async function resolve(): Promise<ToolMap> {
  const tools = await listTools();
  const map: ToolMap = {};

  for (const capability of Object.keys(RULES) as Capability[]) {
    let best: { tool: McpTool; score: number } | null = null;

    for (const tool of tools) {
      const score = scoreTool(tool, capability);
      if (score > 0 && (!best || score > best.score)) {
        best = { tool, score };
      }
    }

    if (best) map[capability] = best.tool;
  }

  cached = map;
  return map;
}

/** Resolves the tool map, de-duplicating concurrent callers. */
export async function toolMap(): Promise<ToolMap> {
  if (cached) return cached;

  if (!inFlight) {
    inFlight = resolve().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

export function resetToolMap(): void {
  cached = null;
}

/**
 * Names of the parameters a resolved tool accepts.
 *
 * Argument names vary as much as tool names do, so call sites look up the actual
 * parameter rather than assuming `symbol` over `pair` or `instrument`.
 */
export function parameterNames(tool: McpTool): string[] {
  const properties = tool.inputSchema?.properties;
  return properties ? Object.keys(properties as object) : [];
}

/** Picks whichever of `candidates` the tool actually declares. */
export function matchParameter(
  tool: McpTool,
  candidates: string[],
): string | undefined {
  const declared = parameterNames(tool);
  const lowered = new Map(declared.map((name) => [name.toLowerCase(), name]));

  for (const candidate of candidates) {
    const found = lowered.get(candidate.toLowerCase());
    if (found) return found;
  }
  return undefined;
}
