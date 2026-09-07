/**
 * Binance USDⓈ-M futures data: open interest, funding, and positioning.
 *
 * These are the inputs an early-signal scanner needs. Spot price alone says what
 * happened; open interest paired with price says *who* is behind it — whether a
 * move is fresh positioning or existing positions unwinding, which is the
 * distinction that makes a signal actionable.
 *
 * All endpoints are public and unauthenticated. Hosts are tried in order because
 * fapi.binance.com geo-blocks some regions with HTTP 451, exactly as the spot
 * API does.
 */

const FUTURES_HOSTS = [
  "https://fapi.binance.com",
  "https://fapi1.binance.com",
] as const;

const FETCH_TIMEOUT_MS = 9000;

/** Hosts that returned a geo-block, remembered for the process lifetime. */
const blockedHosts = new Set<string>();

async function getJson<T>(path: string): Promise<T> {
  const candidates = FUTURES_HOSTS.filter((host) => !blockedHosts.has(host));
  const hosts = candidates.length > 0 ? candidates : FUTURES_HOSTS;

  let lastError: Error | null = null;

  for (const host of hosts) {
    try {
      const response = await fetch(`${host}${path}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { accept: "application/json" },
        cache: "no-store",
      });

      if (response.ok) return (await response.json()) as T;

      if (response.status === 451 || response.status === 403) {
        blockedHosts.add(host);
        lastError = new Error(`${host} returned ${response.status}`);
        continue;
      }

      // A 400 means the symbol has no futures market — true on every host.
      throw new Error(`futures ${path} returned ${response.status}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("futures ")) {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw new Error(`futures hosts unreachable: ${lastError?.message ?? "unknown"}`);
}

export interface OpenInterestPoint {
  timestamp: number;
  /** Open interest in base-asset contracts. */
  openInterest: number;
  /** Notional value in quote currency. */
  notionalUsd: number;
}

/**
 * Open interest history.
 *
 * Binance caps this endpoint at 500 points and only serves the last 30 days.
 */
export async function fetchOpenInterestHistory(
  symbol: string,
  period = "1h",
  limit = 48,
): Promise<OpenInterestPoint[]> {
  const raw = await getJson<
    { sumOpenInterest: string; sumOpenInterestValue: string; timestamp: number }[]
  >(
    `/futures/data/openInterestHist?symbol=${encodeURIComponent(symbol)}` +
      `&period=${period}&limit=${Math.min(500, limit)}`,
  );

  return raw.map((point) => ({
    timestamp: point.timestamp,
    openInterest: Number(point.sumOpenInterest),
    notionalUsd: Number(point.sumOpenInterestValue),
  }));
}

export interface FundingSnapshot {
  markPrice: number;
  indexPrice: number;
  /** Most recent funding rate as a fraction, e.g. 0.0001 = 0.01%. */
  lastFundingRate: number;
  nextFundingTime: number;
}

export async function fetchFunding(symbol: string): Promise<FundingSnapshot> {
  const raw = await getJson<{
    markPrice: string;
    indexPrice: string;
    lastFundingRate: string;
    nextFundingTime: number;
  }>(`/fapi/v1/premiumIndex?symbol=${encodeURIComponent(symbol)}`);

  return {
    markPrice: Number(raw.markPrice),
    indexPrice: Number(raw.indexPrice),
    lastFundingRate: Number(raw.lastFundingRate),
    nextFundingTime: raw.nextFundingTime,
  };
}

export interface RatioPoint {
  timestamp: number;
  /** Ratio above 1 means the long or buy side dominates. */
  ratio: number;
}

/** Long/short account ratio among Binance's top traders by position size. */
export async function fetchTopTraderRatio(
  symbol: string,
  period = "1h",
  limit = 24,
): Promise<RatioPoint[]> {
  const raw = await getJson<{ longShortRatio: string; timestamp: number }[]>(
    `/futures/data/topLongShortAccountRatio?symbol=${encodeURIComponent(symbol)}` +
      `&period=${period}&limit=${limit}`,
  );

  return raw.map((point) => ({
    timestamp: point.timestamp,
    ratio: Number(point.longShortRatio),
  }));
}

/** Aggressive taker flow: buy volume over sell volume. */
export async function fetchTakerRatio(
  symbol: string,
  period = "1h",
  limit = 24,
): Promise<RatioPoint[]> {
  const raw = await getJson<{ buySellRatio: string; timestamp: number }[]>(
    `/futures/data/takerlongshortRatio?symbol=${encodeURIComponent(symbol)}` +
      `&period=${period}&limit=${limit}`,
  );

  return raw.map((point) => ({
    timestamp: point.timestamp,
    ratio: Number(point.buySellRatio),
  }));
}
