/**
 * GET /api/chart?symbol=BTCUSDT&interval=1m&limit=120
 *
 * Seed candles for the live price chart.
 *
 * Served from here rather than fetched in the browser so the request goes through
 * the same multi-host fallback the agents use — `api.binance.com` answers 451 from
 * several regions, and a chart that silently fails for those visitors is worse
 * than one that takes an extra hop.
 */

import { NextResponse } from "next/server";
import { fetchKlines } from "@/lib/agents/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_INTERVALS = ["1m", "3m", "5m", "15m", "1h", "4h", "1d"];

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const symbol = params.get("symbol")?.toUpperCase() ?? "BTCUSDT";

  const requested = params.get("interval") ?? "1m";
  const interval = ALLOWED_INTERVALS.includes(requested) ? requested : "1m";

  const parsed = Number(params.get("limit"));
  const limit = Number.isFinite(parsed) ? Math.min(500, Math.max(20, parsed)) : 120;

  try {
    const candles = await fetchKlines(symbol, interval, limit);

    return NextResponse.json(
      {
        symbol,
        interval,
        candles: candles.map((candle) => ({
          t: candle.openTime,
          o: candle.open,
          h: candle.high,
          l: candle.low,
          c: candle.close,
          v: candle.volume,
        })),
      },
      // A 1m candle is stale within a minute; the WebSocket carries live updates.
      { headers: { "cache-control": "public, max-age=5, s-maxage=15" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "chart data unavailable" },
      { status: 502 },
    );
  }
}
