/**
 * Market reads via the Agent OS MCP server, with a public-REST fallback.
 *
 * Two reasons the fallback is not a cop-out. Market data is the one MCP scope
 * documented as "public, no auth", so both paths return the same numbers from the
 * same exchange — the difference is which door they come through. And the demo
 * has to run for a reviewer who has not authorised anything, since MCP requires a
 * one-time browser consent that cannot be scripted.
 *
 * Which path served a request is reported back, so the UI can show it rather than
 * claiming MCP unconditionally.
 */

import { callTool } from "./client";
import { mcpConfigured } from "./config";
import { matchParameter, toolMap } from "./tools";
import {
  fetchKlines as restKlines,
  fetchOrderBook as restOrderBook,
  fetchTicker as restTicker,
  type Kline,
  type OrderBook,
  type Ticker24h,
} from "@/lib/agents/market";

export type DataSource = "mcp" | "rest";

export interface Sourced<T> {
  data: T;
  source: DataSource;
  /** Tool name when served via MCP, useful for the protocol log. */
  tool?: string;
}

/** Reads a numeric field under any of several plausible key spellings. */
function pickNumber(
  record: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

/** Unwraps a payload that may be nested under data/result/ticker. */
function unwrap(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};
  const record = payload as Record<string, unknown>;

  for (const key of ["data", "result", "ticker", "symbolTicker"]) {
    const nested = record[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      return nested as Record<string, unknown>;
    }
  }
  return record;
}

/**
 * 24h ticker.
 *
 * Field names differ between the MCP tool's shape and the REST response, so the
 * result is normalised onto the REST type the analysis layer already consumes.
 */
export async function fetchTicker(symbol: string): Promise<Sourced<Ticker24h>> {
  if (mcpConfigured()) {
    try {
      const tools = await toolMap();
      const tool = tools.ticker;

      if (tool) {
        const symbolParam = matchParameter(tool, [
          "symbol",
          "pair",
          "instrument",
          "market",
        ]);

        const raw = await callTool(
          tool.name,
          symbolParam ? { [symbolParam]: symbol } : { symbol },
        );
        const record = unwrap(raw);

        const lastPrice = pickNumber(record, [
          "lastPrice",
          "price",
          "last",
          "close",
          "closePrice",
        ]);

        // Only trust the MCP payload if it actually carried a price; otherwise
        // fall through to REST rather than serve zeros.
        if (lastPrice !== undefined) {
          const high = pickNumber(record, ["highPrice", "high", "high24h"]);
          const low = pickNumber(record, ["lowPrice", "low", "low24h"]);

          return {
            source: "mcp",
            tool: tool.name,
            data: {
              symbol:
                typeof record.symbol === "string" ? record.symbol : symbol,
              lastPrice: String(lastPrice),
              priceChangePercent: String(
                pickNumber(record, [
                  "priceChangePercent",
                  "changePercent",
                  "percentChange",
                  "priceChangePercentage",
                ]) ?? 0,
              ),
              highPrice: String(high ?? lastPrice),
              lowPrice: String(low ?? lastPrice),
              volume: String(pickNumber(record, ["volume", "baseVolume"]) ?? 0),
              quoteVolume: String(
                pickNumber(record, [
                  "quoteVolume",
                  "quoteAssetVolume",
                  "volumeQuote",
                ]) ?? 0,
              ),
              weightedAvgPrice: String(
                pickNumber(record, ["weightedAvgPrice", "vwap"]) ?? lastPrice,
              ),
            },
          };
        }
      }
    } catch {
      // MCP unavailable or shape unrecognised — REST returns the same data.
    }
  }

  return { data: await restTicker(symbol), source: "rest" };
}

/** Normalises a book side that may be objects or [price, qty] tuples. */
function normaliseLevels(value: unknown): [string, string][] {
  if (!Array.isArray(value)) return [];

  const levels: [string, string][] = [];
  for (const entry of value) {
    if (Array.isArray(entry) && entry.length >= 2) {
      levels.push([String(entry[0]), String(entry[1])]);
      continue;
    }
    if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      const price = pickNumber(record, ["price", "p", "0"]);
      const quantity = pickNumber(record, ["quantity", "qty", "amount", "size", "1"]);
      if (price !== undefined && quantity !== undefined) {
        levels.push([String(price), String(quantity)]);
      }
    }
  }
  return levels;
}

export async function fetchOrderBook(
  symbol: string,
  limit = 100,
): Promise<Sourced<OrderBook>> {
  if (mcpConfigured()) {
    try {
      const tools = await toolMap();
      const tool = tools.orderbook;

      if (tool) {
        const symbolParam = matchParameter(tool, ["symbol", "pair", "market"]);
        const limitParam = matchParameter(tool, ["limit", "depth", "levels"]);

        const args: Record<string, unknown> = {};
        args[symbolParam ?? "symbol"] = symbol;
        if (limitParam) args[limitParam] = limit;

        const record = unwrap(await callTool(tool.name, args));
        const bids = normaliseLevels(record.bids ?? record.bid);
        const asks = normaliseLevels(record.asks ?? record.ask);

        if (bids.length > 0 && asks.length > 0) {
          return {
            source: "mcp",
            tool: tool.name,
            data: {
              lastUpdateId:
                pickNumber(record, ["lastUpdateId", "updateId"]) ?? 0,
              bids,
              asks,
            },
          };
        }
      }
    } catch {
      // Fall through to REST.
    }
  }

  return { data: await restOrderBook(symbol, limit), source: "rest" };
}

export async function fetchKlines(
  symbol: string,
  interval = "1h",
  limit = 48,
): Promise<Sourced<Kline[]>> {
  if (mcpConfigured()) {
    try {
      const tools = await toolMap();
      const tool = tools.klines;

      if (tool) {
        const symbolParam = matchParameter(tool, ["symbol", "pair", "market"]);
        const intervalParam = matchParameter(tool, [
          "interval",
          "timeframe",
          "period",
        ]);
        const limitParam = matchParameter(tool, ["limit", "count", "size"]);

        const args: Record<string, unknown> = {};
        args[symbolParam ?? "symbol"] = symbol;
        if (intervalParam) args[intervalParam] = interval;
        if (limitParam) args[limitParam] = limit;

        const raw = await callTool(tool.name, args);
        const rows = Array.isArray(raw)
          ? raw
          : Array.isArray(unwrap(raw).klines)
            ? (unwrap(raw).klines as unknown[])
            : [];

        const candles: Kline[] = [];
        for (const row of rows) {
          // Binance's REST shape is a positional array; MCP may return objects.
          if (Array.isArray(row) && row.length >= 6) {
            candles.push({
              openTime: Number(row[0]),
              open: Number(row[1]),
              high: Number(row[2]),
              low: Number(row[3]),
              close: Number(row[4]),
              volume: Number(row[5]),
            });
          } else if (row && typeof row === "object") {
            const record = row as Record<string, unknown>;
            const close = pickNumber(record, ["close", "c", "closePrice"]);
            if (close === undefined) continue;
            candles.push({
              openTime: pickNumber(record, ["openTime", "time", "t"]) ?? 0,
              open: pickNumber(record, ["open", "o"]) ?? close,
              high: pickNumber(record, ["high", "h"]) ?? close,
              low: pickNumber(record, ["low", "l"]) ?? close,
              close,
              volume: pickNumber(record, ["volume", "v"]) ?? 0,
            });
          }
        }

        if (candles.length > 2) {
          return { data: candles, source: "mcp", tool: tool.name };
        }
      }
    } catch {
      // Fall through to REST.
    }
  }

  return { data: await restKlines(symbol, interval, limit), source: "rest" };
}
