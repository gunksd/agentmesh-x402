/**
 * Live trading pair catalog.
 *
 * Two public, unauthenticated sources are merged:
 *
 *   exchangeInfo  — every spot symbol and its trading status. 1,300+ pairs.
 *   Alpha list    — Binance Alpha tokens, 668 of them, of which ~118 carry
 *                   `listingCex: true` meaning they also trade on spot.
 *
 * The merge is what makes the Alpha flag possible: exchangeInfo has no field
 * marking a symbol as an Alpha graduate, and searching for "ALPHA" in symbol
 * names returns nothing. The only way to know is to cross-reference the Alpha
 * catalog's `cexCoinName` against exchangeInfo's `baseAsset`.
 *
 * The response is ~17MB, so this is fetched server-side, reduced to the fields
 * the picker needs, and cached — never shipped to the browser raw.
 */

const EXCHANGE_INFO_HOSTS = [
  "https://data-api.binance.vision/api/v3/exchangeInfo",
  "https://api.binance.com/api/v3/exchangeInfo",
] as const;

const ALPHA_LIST_URL =
  "https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list";

const FETCH_TIMEOUT_MS = 20_000;

/** The catalog changes on listings, not by the minute. */
const CACHE_TTL_MS = 30 * 60 * 1000;

export interface TradingPair {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  /** Trades on spot with margin enabled — a liquidity proxy for ranking. */
  marginAllowed: boolean;
  /** Listed on Binance Alpha as well as spot. */
  isAlpha: boolean;
  /** Alpha 24h volume in USD, when known. Used to rank Alpha pairs. */
  alphaVolume24h?: number;
}

interface ExchangeInfoSymbol {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  isSpotTradingAllowed?: boolean;
  isMarginTradingAllowed?: boolean;
}

interface AlphaToken {
  symbol: string;
  cexCoinName?: string;
  listingCex?: boolean;
  volume24h?: string;
}

/**
 * Quote assets worth offering. Restricting these cuts 1,362 pairs to a set a
 * person can navigate, and keeps out fiat pairs whose depth analysis is less
 * comparable.
 */
const QUOTE_ALLOWLIST = new Set(["USDT", "USDC", "FDUSD", "BTC", "BNB"]);

/** Majors surface first regardless of what the merge ranks them. */
const PRIORITY_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "DOGEUSDT",
];

interface CatalogCache {
  pairs: TradingPair[];
  fetchedAt: number;
}

let cache: CatalogCache | null = null;
let inFlight: Promise<TradingPair[]> | null = null;

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return (await response.json()) as T;
}

/** exchangeInfo, trying hosts in order — the primary geo-blocks some regions. */
async function fetchExchangeInfo(): Promise<ExchangeInfoSymbol[]> {
  let lastError: Error | null = null;

  for (const host of EXCHANGE_INFO_HOSTS) {
    try {
      const data = await getJson<{ symbols?: ExchangeInfoSymbol[] }>(
        `${host}?permissions=SPOT`,
      );
      if (data.symbols?.length) return data.symbols;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw new Error(`exchangeInfo unavailable: ${lastError?.message ?? "unknown"}`);
}

/**
 * Base assets that also trade on Binance Alpha, mapped to their 24h volume.
 *
 * Returns an empty map on failure: the Alpha flag is a nice-to-have, and losing
 * it should not empty the pair list.
 */
async function fetchAlphaAssets(): Promise<Map<string, number>> {
  try {
    const data = await getJson<{ data?: AlphaToken[] }>(ALPHA_LIST_URL);
    const assets = new Map<string, number>();

    for (const token of data.data ?? []) {
      // `listingCex` alone is the signal. Note that `fullyDelisted` is NOT a
      // disqualifier despite the name: it means delisted *from Alpha*, which is
      // what happens when a token graduates to spot. Of the 118 listingCex
      // tokens, the 90 flagged fullyDelisted include 88 that trade on spot
      // today, while the 28 unflagged ones trade on none of them. Filtering it
      // out excludes exactly the pairs we want to mark.
      if (!token.listingCex) continue;

      // cexCoinName is the exchange-side ticker and may differ from the Alpha
      // display symbol, so prefer it when present.
      const asset = (token.cexCoinName || token.symbol || "").toUpperCase();
      if (!asset) continue;

      const volume = Number(token.volume24h);
      assets.set(asset, Number.isFinite(volume) ? volume : 0);
    }

    return assets;
  } catch {
    return new Map();
  }
}

/** Ranks pairs so the picker's default ordering is useful without a query. */
function rank(pair: TradingPair): number {
  const priority = PRIORITY_SYMBOLS.indexOf(pair.symbol);
  if (priority >= 0) return -1000 + priority;

  let score = 0;
  // USDT pairs carry the most depth, which is what the agents analyse.
  if (pair.quoteAsset === "USDT") score -= 100;
  else if (pair.quoteAsset === "USDC") score -= 60;
  if (pair.marginAllowed) score -= 40;
  if (pair.isAlpha) score -= 20;

  return score;
}

async function build(): Promise<TradingPair[]> {
  const [symbols, alphaAssets] = await Promise.all([
    fetchExchangeInfo(),
    fetchAlphaAssets(),
  ]);

  const pairs: TradingPair[] = [];

  for (const entry of symbols) {
    if (entry.status !== "TRADING") continue;
    if (entry.isSpotTradingAllowed === false) continue;
    if (!QUOTE_ALLOWLIST.has(entry.quoteAsset)) continue;

    const alphaVolume = alphaAssets.get(entry.baseAsset.toUpperCase());

    pairs.push({
      symbol: entry.symbol,
      baseAsset: entry.baseAsset,
      quoteAsset: entry.quoteAsset,
      marginAllowed: Boolean(entry.isMarginTradingAllowed),
      isAlpha: alphaVolume !== undefined,
      alphaVolume24h: alphaVolume,
    });
  }

  pairs.sort((a, b) => rank(a) - rank(b) || a.symbol.localeCompare(b.symbol));

  cache = { pairs, fetchedAt: Date.now() };
  return pairs;
}

/** Returns the catalog, refreshing when stale and de-duplicating concurrent calls. */
export async function tradingPairs(): Promise<TradingPair[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.pairs;
  }

  if (!inFlight) {
    inFlight = build().finally(() => {
      inFlight = null;
    });
  }

  try {
    return await inFlight;
  } catch (error) {
    // Serve a stale catalog rather than nothing if a refresh fails.
    if (cache) return cache.pairs;
    throw error;
  }
}

/**
 * Searches the catalog.
 *
 * Matches are ordered by how directly they hit: exact symbol, then symbol
 * prefix, then base-asset prefix, then substring. Typing "BTC" should surface
 * BTCUSDT ahead of a pair that merely contains those letters.
 */
export function searchPairs(
  pairs: TradingPair[],
  query: string,
  limit = 50,
): TradingPair[] {
  const q = query.trim().toUpperCase();
  if (!q) return pairs.slice(0, limit);

  const scored: { pair: TradingPair; score: number }[] = [];

  for (const pair of pairs) {
    const symbol = pair.symbol;
    const base = pair.baseAsset;

    let score: number | null = null;
    if (symbol === q) score = 0;
    else if (base === q) score = 1;
    else if (symbol.startsWith(q)) score = 2;
    else if (base.startsWith(q)) score = 3;
    else if (symbol.includes(q)) score = 4;

    if (score !== null) scored.push({ pair, score });
  }

  scored.sort(
    (a, b) => a.score - b.score || rank(a.pair) - rank(b.pair),
  );

  return scored.slice(0, limit).map((entry) => entry.pair);
}

/** Confirms a symbol is tradable before an agent run spends anything on it. */
export async function isTradablePair(symbol: string): Promise<boolean> {
  const pairs = await tradingPairs();
  const target = symbol.toUpperCase();
  return pairs.some((pair) => pair.symbol === target);
}
