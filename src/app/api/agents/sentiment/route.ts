/**
 * Sentiment Agent — $0.015 per call.
 *
 * Momentum-derived sentiment score with a breakdown of what drove it.
 */

import { NextResponse } from "next/server";
import { analyseSentiment } from "@/lib/agents/analysis";
import { withPayment } from "@/lib/x402/paywall";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Candle intervals Binance accepts for the lookback window. */
const ALLOWED_WINDOWS = ["15m", "30m", "1h", "4h", "1d"];

export const GET = withPayment("sentiment", async (request, context) => {
  const params = new URL(request.url).searchParams;
  const symbol = params.get("symbol")?.toUpperCase() ?? "BTCUSDT";

  const requested = params.get("window") ?? "1h";
  const window = ALLOWED_WINDOWS.includes(requested) ? requested : "1h";

  const data = await analyseSentiment(symbol, window);

  return NextResponse.json({
    agent: "sentiment",
    paidBy: context.payer,
    transaction: context.transaction,
    data,
  });
});
