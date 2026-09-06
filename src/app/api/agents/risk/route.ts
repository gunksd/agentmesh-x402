/**
 * Risk Agent — $0.02 per call.
 *
 * Realised volatility, value at risk and leverage guidance for a position size.
 */

import { NextResponse } from "next/server";
import { analyseRisk } from "@/lib/agents/analysis";
import { withPayment } from "@/lib/x402/paywall";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Bounds keep a stray query string from producing absurd VaR figures. */
const MIN_NOTIONAL = 100;
const MAX_NOTIONAL = 100_000_000;

export const GET = withPayment("risk", async (request, context) => {
  const params = new URL(request.url).searchParams;
  const symbol = params.get("symbol")?.toUpperCase() ?? "BTCUSDT";

  const parsed = Number(params.get("notional"));
  const notional = Number.isFinite(parsed)
    ? Math.min(MAX_NOTIONAL, Math.max(MIN_NOTIONAL, parsed))
    : 10_000;

  const data = await analyseRisk(symbol, notional);

  return NextResponse.json({
    agent: "risk",
    paidBy: context.payer,
    transaction: context.transaction,
    data,
  });
});
