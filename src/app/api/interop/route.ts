/**
 * GET /api/interop?query=...
 *
 * Discovers third-party listings on Binance's B402 Bazaar, then calls each one
 * and decodes the 402 challenge it returns.
 *
 * This is the part of the project that is not self-referential: the endpoints
 * probed here belong to strangers, and the payment requirements come off their
 * wire, not ours. Nothing is paid — 402 is the unpaid response.
 */

import { NextResponse } from "next/server";
import { runInteropReport } from "@/lib/agents/interop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Several outbound probes to other people's servers need headroom. */
export const maxDuration = 30;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = params.get("query")?.trim() || "crypto price";

  const parsed = Number(params.get("limit"));
  // Capped deliberately: probing other people's endpoints should stay polite.
  const limit = Number.isFinite(parsed)
    ? Math.min(6, Math.max(1, parsed))
    : 4;

  try {
    const report = await runInteropReport(query, limit);
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "interop probe failed",
      },
      { status: 502 },
    );
  }
}
