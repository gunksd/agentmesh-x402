/**
 * GET /api/symbols?query=BTC&limit=40
 *
 * Serves the trading pair catalog for the picker.
 *
 * Server-side because exchangeInfo is ~17MB and the Alpha cross-reference needs
 * a second request — both are reduced to a handful of fields here and cached, so
 * the browser receives kilobytes rather than megabytes.
 */

import { NextResponse } from "next/server";
import { searchPairs, tradingPairs } from "@/lib/agents/symbols";

export const runtime = "nodejs";

/** Two upstream fetches on a cold cache need room. */
export const maxDuration = 30;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = params.get("query") ?? "";

  const parsed = Number(params.get("limit"));
  const limit = Number.isFinite(parsed) ? Math.min(200, Math.max(1, parsed)) : 40;

  const alphaOnly = params.get("alpha") === "1";

  try {
    const all = await tradingPairs();
    const pool = alphaOnly ? all.filter((pair) => pair.isAlpha) : all;
    const results = searchPairs(pool, query, limit);

    return NextResponse.json(
      {
        total: pool.length,
        alphaCount: all.filter((pair) => pair.isAlpha).length,
        query: query || null,
        pairs: results,
      },
      {
        // The catalog changes on listings; a short edge cache keeps the picker
        // snappy without serving a stale set for long.
        headers: { "cache-control": "public, max-age=300, s-maxage=900" },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "symbol catalog unavailable",
      },
      { status: 502 },
    );
  }
}
