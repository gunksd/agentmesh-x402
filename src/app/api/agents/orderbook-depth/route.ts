/**
 * Orderbook Depth Agent — $0.02 per call.
 *
 * Bid/ask imbalance, liquidity walls and slippage estimates from the live book.
 */

import { NextResponse } from "next/server";
import { analyseDepth } from "@/lib/agents/analysis";
import { withPayment } from "@/lib/x402/paywall";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Binance accepts a fixed set of depth limits. */
const ALLOWED_LIMITS = [5, 10, 20, 50, 100, 500, 1000];

export const GET = withPayment("orderbook-depth", async (request, context) => {
  const params = new URL(request.url).searchParams;
  const symbol = params.get("symbol")?.toUpperCase() ?? "BTCUSDT";

  const requested = Number(params.get("depth"));
  const limit = ALLOWED_LIMITS.includes(requested) ? requested : 100;

  const data = await analyseDepth(symbol, limit);

  return NextResponse.json({
    agent: "orderbook-depth",
    paidBy: context.payer,
    transaction: context.transaction,
    data,
  });
});
