/**
 * GET /api/diag
 *
 * Reports which upstreams this deployment can actually reach, and from where.
 *
 * Exists because a failure inside a paid endpoint is invisible from outside: the
 * paywall settles payment first, so an unreachable upstream surfaces to the
 * caller as a generic post-payment error with no cause attached. This probes each
 * dependency directly and reports the status code.
 */

import { NextResponse } from "next/server";
import { publicClient, relayerAccount } from "@/lib/x402/clients";
import { ACTIVE_CHAIN_ID, SETTLEMENT_TOKEN } from "@/lib/chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Probe {
  name: string;
  url: string;
  status: number | string;
  ms: number;
  note?: string;
}

async function probe(name: string, url: string): Promise<Probe> {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    // Binance answers 451 to requests from restricted jurisdictions, which is
    // the one failure that looks like a code bug but is purely about egress IP.
    const note =
      response.status === 451
        ? "geo-restricted from this region"
        : response.status === 403
          ? "forbidden — possibly IP-blocked"
          : undefined;

    return { name, url, status: response.status, ms: Date.now() - started, note };
  } catch (error) {
    return {
      name,
      url,
      status: error instanceof Error ? error.name : "error",
      ms: Date.now() - started,
      note: error instanceof Error ? error.message.slice(0, 120) : undefined,
    };
  }
}

export async function GET() {
  const [spot, depth, bazaar] = await Promise.all([
    probe("binance spot ticker", "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT"),
    probe("binance depth", "https://api.binance.com/api/v3/depth?symbol=BTCUSDT&limit=5"),
    probe(
      "b402 bazaar",
      "https://www.binance.com/bapi/ramp/v1/public/ramp/b402/bazaar/resources?limit=1",
    ),
  ]);

  let chain: Record<string, unknown>;
  try {
    const relayer = relayerAccount().address;
    const [blockNumber, pendingNonce, latestNonce] = await Promise.all([
      publicClient.getBlockNumber(),
      publicClient.getTransactionCount({ address: relayer, blockTag: "pending" }),
      publicClient.getTransactionCount({ address: relayer, blockTag: "latest" }),
    ]);

    chain = {
      chainId: ACTIVE_CHAIN_ID,
      blockNumber: Number(blockNumber),
      token: SETTLEMENT_TOKEN.address,
      relayer,
      // A gap between these two means transactions are stuck in the mempool,
      // which is what nonce collisions look like from the outside.
      pendingNonce,
      latestNonce,
    };
  } catch (error) {
    chain = {
      chainId: ACTIVE_CHAIN_ID,
      error: error instanceof Error ? error.message : "rpc unreachable",
    };
  }

  return NextResponse.json({
    region: process.env.VERCEL_REGION ?? "local",
    upstreams: [spot, depth, bazaar],
    chain,
  });
}
