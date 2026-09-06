/**
 * Market data sources.
 *
 * The public REST path, used when MCP is not authorised. Same numbers, same
 * exchange — market data is the one Agent OS scope documented as "public, no
 * auth", so this is a different door to identical data rather than a substitute.
 *
 * Hosts are tried in order because `api.binance.com` answers 451 from some
 * regions, including the US datacentres Vercel deploys to by default. That
 * failure is invisible from outside a paid endpoint: the paywall settles payment
 * before calling upstream, so a geo-block surfaces as a post-payment error with
 * no cause attached. `data-api.binance.vision` is Binance's public market-data
 * mirror and answers where the primary host refuses.
 */

/**
 * Ordered by preference. A host that geo-blocks is remembered for the life of the
 * process so later calls skip straight to one that works.
 */
const API_HOSTS = [
  "https://data-api.binance.vision/api/v3",
  "https://api.binance.com/api/v3",
  "https://api-gcp.binance.com/api/v3",
] as const;

/** Upstream calls are cheap but must not hang an agent request. */
const FETCH_TIMEOUT_MS = 8000;

/** Hosts that returned a geo-block or refused outright. */
const blockedHosts = new Set<string>();

/** Status codes that mean "this host will never serve us", not "try again". */
function isHostLevelRejection(status: number): boolean {
  return status === 451 || status === 403;
}

/**
 * Fetches a path across the candidate hosts, returning the first success.
 *
 * @param path Path below /api/v3, starting with a slash.
 */
async function getJson<T>(path: string): Promise<T> {
  const candidates = API_HOSTS.filter((host) => !blockedHosts.has(host));

  // Every host is blocked — retry them all rather than fail without trying.
  const hosts = candidates.length > 0 ? candidates : API_HOSTS;

  let lastError: Error | null = null;

  for (const host of hosts) {
    const url = `${host}${path}`;

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { accept: "application/json" },
        cache: "no-store",
      });

      if (response.ok) return (await response.json()) as T;

      if (isHostLevelRejection(response.status)) {
        blockedHosts.add(host);
        lastError = new Error(
          `${host} returned ${response.status} (region-restricted)`,
        );
        continue;
      }

      // A 4xx on one host will repeat on the others — a bad symbol stays bad.
      throw new Error(`Market request failed: ${response.status} ${url}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Market request")) {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw new Error(
    `All market data hosts unreachable: ${lastError?.message ?? "unknown"}`,
  );
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
    `/ticker/24hr?symbol=${encodeURIComponent(symbol)}`,
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
    `/depth?symbol=${encodeURIComponent(symbol)}&limit=${limit}`,
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
    `/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`,
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
