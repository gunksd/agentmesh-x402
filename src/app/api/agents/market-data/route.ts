/**
 * Market Data Agent — $0.01 per call.
 *
 * Returns 402 until payment settles on BNB Smart Chain, then serves live
 * Binance ticker data.
 */

import { NextResponse } from "next/server";
import { analyseMarketData } from "@/lib/agents/analysis";
import { withPayment } from "@/lib/x402/paywall";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withPayment("market-data", async (request, context) => {
  const symbol =
    new URL(request.url).searchParams.get("symbol")?.toUpperCase() ?? "BTCUSDT";

  const data = await analyseMarketData(symbol);

  return NextResponse.json({
    agent: "market-data",
    paidBy: context.payer,
    transaction: context.transaction,
    data,
  });
});
