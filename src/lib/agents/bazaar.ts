/**
 * B402 Bazaar discovery.
 *
 * Public, read-only, no authentication — the one Binance x402 surface reachable
 * without merchant onboarding. The orchestrator queries it before spending
 * anything, so "the agent discovers services it can pay for" is a real network
 * call against Binance rather than a scripted step.
 *
 * The base URL is documented as stable and safe to hardcode in client SDKs.
 */

const BAZAAR_BASE =
  process.env.BAZAAR_BASE_URL ??
  "https://www.binance.com/bapi/ramp/v1/public/ramp/b402";

const FETCH_TIMEOUT_MS = 8000;

/** Binance wraps every BAPI response in this envelope; payload sits in `data`. */
interface BapiEnvelope<T> {
  code: string;
  message: string | null;
  data: T | null;
  success: boolean;
}

export interface BazaarAccept {
  scheme: string;
  network: string;
  asset: string;
  maxAmountRequired: string;
  payTo: string;
}

export interface BazaarResource {
  resource: string;
  type: string;
  x402Version: number;
  description: string;
  accepts: BazaarAccept[];
  lastUpdated: number;
  quality?: {
    l30DaysTotalCalls: number;
    l30DaysUniquePayers: number;
    lastCalledAt: number;
  };
}

/**
 * Full-text search over listed paid endpoints.
 *
 * Search has no cursor — narrow with filters instead of paging. Limit caps at 20.
 */
export async function searchBazaar(
  query: string,
  options: { network?: string; maxUsdPrice?: string; limit?: number } = {},
): Promise<BazaarResource[]> {
  const params = new URLSearchParams({ query });
  if (options.network) params.set("network", options.network);
  if (options.maxUsdPrice) params.set("maxUsdPrice", options.maxUsdPrice);
  params.set("limit", String(Math.min(20, options.limit ?? 10)));

  try {
    const response = await fetch(`${BAZAAR_BASE}/bazaar/search?${params}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) return [];

    const envelope = (await response.json()) as BapiEnvelope<{
      resources?: BazaarResource[];
    }>;

    return envelope.data?.resources ?? [];
  } catch {
    // Discovery is additive: a Bazaar outage must not block the paid pipeline.
    return [];
  }
}

/** Browse the catalog without a query. */
export async function listBazaar(limit = 25): Promise<BazaarResource[]> {
  const params = new URLSearchParams({ limit: String(Math.min(100, limit)) });

  try {
    const response = await fetch(`${BAZAAR_BASE}/bazaar/resources?${params}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) return [];

    const envelope = (await response.json()) as BapiEnvelope<{
      items?: BazaarResource[];
    }>;

    return envelope.data?.items ?? [];
  } catch {
    return [];
  }
}

/**
 * Best-effort USD price of a listing.
 *
 * `maxAmountRequired` is in atomic units and the Bazaar does not publish token
 * decimals, so we assume 18 for known 18-decimal BSC stablecoins and 6
 * otherwise. Display only — never used for settlement.
 */
export function listingPriceUsd(resource: BazaarResource): number | undefined {
  const primary = resource.accepts?.[0];
  if (!primary?.maxAmountRequired) return undefined;

  const eighteenDecimalAssets = new Set([
    "0x55d398326f99059ff775485246999027b3197955", // USDT (BSC)
    "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", // USDC (BSC)
    "0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d", // USD1
    "0xce24439f2d9c6a2289f741120fe202248b666666", // U
  ]);

  const decimals = eighteenDecimalAssets.has(primary.asset?.toLowerCase())
    ? 18
    : 6;

  const value = Number(primary.maxAmountRequired) / 10 ** decimals;
  return Number.isFinite(value) ? value : undefined;
}
