/**
 * Interoperability probe against real third-party endpoints.
 *
 * Discovery alone proves little — a listing is just metadata. This takes the
 * next step: it calls the endpoints strangers have listed on Binance's B402
 * Bazaar and decodes the 402 challenge each one returns, using the same client
 * that pays our own agents.
 *
 * Nothing is paid here. A 402 is the unpaid response, so probing costs nothing
 * and touches no funds — what it establishes is that the payment requirements on
 * the far side are real and machine-readable.
 *
 * Two things surfaced while building this, both worth reporting rather than
 * smoothing over:
 *
 *   - Bazaar metadata lists these resources as `eip155:56` (BNB Smart Chain),
 *     while the endpoints themselves answer with `network: "base"`. The catalog
 *     and the endpoint disagree about the settlement chain.
 *   - They speak x402 v1 (`X-PAYMENT`, `scheme: "exact"`), while B402's own docs
 *     and this project implement v2 (`PAYMENT-SIGNATURE`, `permit2-exact`).
 *
 * So the ecosystem is live but not yet uniform, and a client that wants to pay
 * across it has to read the version off the wire instead of assuming one.
 */

import { listingPriceUsd, searchBazaar, type BazaarResource } from "./bazaar";

const PROBE_TIMEOUT_MS = 9000;

/** Payment requirements as they appear across both protocol versions. */
interface WireRequirements {
  scheme?: string;
  network?: string;
  maxAmountRequired?: string;
  amount?: string;
  asset?: string;
  payTo?: string;
  description?: string;
  resource?: string;
}

interface WireChallenge {
  x402Version?: number;
  error?: string;
  accepts?: WireRequirements[];
}

export interface InteropProbe {
  resource: string;
  /** What the Bazaar catalog claims. */
  listed: {
    network?: string;
    scheme?: string;
    priceUsd?: number;
    description: string;
  };
  /** What the endpoint actually answered. */
  observed?: {
    status: number;
    x402Version?: number;
    scheme?: string;
    network?: string;
    amount?: string;
    asset?: string;
    /** Which header the server used to signal payment requirements. */
    headerStyle: HeaderStyle;
  };
  /** True when the endpoint's stated chain differs from its Bazaar listing. */
  networkMismatch?: boolean;
  /** True when the endpoint speaks a different protocol version than we do. */
  versionMismatch?: boolean;
  reachable: boolean;
  note?: string;
}

/** Normalises a chain reference so `eip155:8453` and `base` compare equal. */
function canonicalNetwork(value?: string): string | undefined {
  if (!value) return undefined;
  const lowered = value.toLowerCase();

  const byName: Record<string, string> = {
    base: "eip155:8453",
    "base-sepolia": "eip155:84532",
    bsc: "eip155:56",
    "bsc-testnet": "eip155:97",
    ethereum: "eip155:1",
    polygon: "eip155:137",
  };

  return byName[lowered] ?? lowered;
}

type HeaderStyle = "v1-x-payment" | "v2-payment-required" | "body-only" | "none";

/** Decodes the base64 PAYMENT-REQUIRED header, if present and well-formed. */
function decodeChallengeHeader(headers: Headers): WireChallenge | null {
  const raw = headers.get("payment-required");
  if (!raw) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64").toString("utf8"),
    ) as WireChallenge;
    return parsed.accepts?.length ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Chooses the option most relevant to this project.
 *
 * Endpoints often list several chains. Preferring a BNB Smart Chain entry means
 * the probe reports what we could actually pay rather than whichever option the
 * server happened to put first.
 */
function pickBestAccept(accepts: WireRequirements[]): WireRequirements | undefined {
  const bsc = accepts.find(
    (a) => canonicalNetwork(a.network) === "eip155:56",
  );
  return bsc ?? accepts[0];
}

/** Identifies which header carried the challenge, i.e. which version is spoken. */
function detectHeaderStyle(headers: Headers): HeaderStyle {
  // v2 sends PAYMENT-REQUIRED; v1 implementations advertise X-PAYMENT instead.
  if (headers.get("payment-required")) return "v2-payment-required";

  const exposed = headers.get("access-control-expose-headers") ?? "";
  if (headers.get("x-payment") || /x-payment/i.test(exposed)) {
    return "v1-x-payment";
  }
  return "body-only";
}

/** Probes one listing. Never throws — an unreachable peer is a finding, not a fault. */
export async function probeListing(
  listing: BazaarResource,
): Promise<InteropProbe> {
  const listedAccept = listing.accepts?.[0];

  const probe: InteropProbe = {
    resource: listing.resource,
    listed: {
      network: listedAccept?.network,
      scheme: listedAccept?.scheme,
      priceUsd: listingPriceUsd(listing),
      description: listing.description,
    },
    reachable: false,
  };

  // Only HTTP resources are directly probeable; MCP tool listings are not.
  if (listing.type !== "http") {
    probe.note = `${listing.type} resource — not probeable over plain HTTP`;
    return probe;
  }

  try {
    const response = await fetch(listing.resource, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    const headerStyle = detectHeaderStyle(response.headers);

    let body: WireChallenge = {};
    try {
      body = (await response.json()) as WireChallenge;
    } catch {
      // A non-JSON body still leaves the status and headers informative.
    }

    // The header is authoritative where both are present. Real Bazaar endpoints
    // carry v1-on-Base in the body for backward compatibility while the header
    // advertises v2 with more chains — reading only the body understates them.
    const fromHeader = decodeChallengeHeader(response.headers);
    const challenge = fromHeader ?? body;

    const accepted = pickBestAccept(challenge.accepts ?? []);

    probe.reachable = true;
    probe.observed = {
      status: response.status,
      x402Version: challenge.x402Version,
      scheme: accepted?.scheme,
      network: accepted?.network,
      amount: accepted?.maxAmountRequired ?? accepted?.amount,
      asset: accepted?.asset,
      headerStyle,
    };

    const listedChain = canonicalNetwork(listedAccept?.network);
    const observedChain = canonicalNetwork(accepted?.network);
    probe.networkMismatch = Boolean(
      listedChain && observedChain && listedChain !== observedChain,
    );

    // This project implements v2; anything else needs a different signing path.
    probe.versionMismatch = Boolean(
      challenge.x402Version !== undefined && challenge.x402Version !== 2,
    );

    if (response.status !== 402) {
      probe.note = `answered ${response.status} rather than 402`;
    }
  } catch (error) {
    probe.note =
      error instanceof Error && error.name === "TimeoutError"
        ? "timed out"
        : error instanceof Error
          ? error.message.slice(0, 100)
          : "unreachable";
  }

  return probe;
}

export interface InteropReport {
  query: string;
  discovered: number;
  probes: InteropProbe[];
  summary: {
    reachable: number;
    quoting402: number;
    networkMismatches: number;
    versionMismatches: number;
  };
}

/**
 * Discovers listings and probes them concurrently.
 *
 * @param query Free-text Bazaar search.
 * @param limit How many listings to probe. Kept small — these are other
 *              people's servers, and a probe sweep should stay polite.
 */
export async function runInteropReport(
  query = "crypto price",
  limit = 4,
): Promise<InteropReport> {
  const listings = await searchBazaar(query, { limit: Math.min(8, limit * 2) });
  const probeable = listings.slice(0, limit);

  const probes = await Promise.all(probeable.map(probeListing));

  return {
    query,
    discovered: listings.length,
    probes,
    summary: {
      reachable: probes.filter((p) => p.reachable).length,
      quoting402: probes.filter((p) => p.observed?.status === 402).length,
      networkMismatches: probes.filter((p) => p.networkMismatch).length,
      versionMismatches: probes.filter((p) => p.versionMismatch).length,
    },
  };
}
