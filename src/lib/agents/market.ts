/**
 * Market data sources.
 *
 * Reads hit Binance's public market endpoints directly — the same surface Agent
 * OS exposes as the "public, no auth" scope of its MCP server.
 *
 * These do not go through the MCP server. That connection authenticates by
 * browser-based OAuth consent against a Binance desktop session, with no API-key
 * path, so a headless server process cannot establish it unattended. Market data
 * needs no authentication anyway; MCP would matter for the account, trade and
 * transfer scopes, which this project does not touch.
 */

const PUBLIC_API = "https://api.binance.com/api/v3";

/** Upstream calls are cheap but must not hang an agent request. */
const FETCH_TIMEOUT_MS = 8000;

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Market request failed: ${response.status} ${url}`);
  }
  return (await response.json()) as T;
}

export interface Ticker24h {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  weightedAvgPrice: string;
}

export function fetchTicker(symbol: string): Promise<Ticker24h> {
  return getJson<Ticker24h>(
    `${PUBLIC_API}/ticker/24hr?symbol=${encodeURIComponent(symbol)}`,
  );
}

export interface OrderBook {
  lastUpdateId: number;
  /** [price, quantity] pairs, best first. */
  bids: [string, string][];
  asks: [string, string][];
}

export function fetchOrderBook(symbol: string, limit = 100): Promise<OrderBook> {
  return getJson<OrderBook>(
    `${PUBLIC_API}/depth?symbol=${encodeURIComponent(symbol)}&limit=${limit}`,
  );
}

export interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Recent candles, used for realised volatility and trend context. */
export async function fetchKlines(
  symbol: string,
  interval = "1h",
  limit = 48,
): Promise<Kline[]> {
  const raw = await getJson<unknown[][]>(
    `${PUBLIC_API}/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`,
  );

  return raw.map((candle) => ({
    openTime: Number(candle[0]),
    open: Number(candle[1]),
    high: Number(candle[2]),
    low: Number(candle[3]),
    close: Number(candle[4]),
    volume: Number(candle[5]),
  }));
}

/** Annualised realised volatility from close-to-close log returns. */
export function realisedVolatility(klines: Kline[]): number {
  if (klines.length < 3) return 0;

  const returns: number[] = [];
  for (let i = 1; i < klines.length; i += 1) {
    const previous = klines[i - 1].close;
    const current = klines[i].close;
    if (previous > 0 && current > 0) {
      returns.push(Math.log(current / previous));
    }
  }
  if (returns.length < 2) return 0;

  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);

  // Hourly candles → 24 * 365 periods per year.
  return Math.sqrt(variance) * Math.sqrt(24 * 365);
}
