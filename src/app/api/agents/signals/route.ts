/**
 * Signal Scanner Agent — $0.03 per call, the priciest market reader.
 *
 * The only agent that touches the futures API. Open interest is the input the
 * others cannot see, and it is what separates "price moved" from "money moved" —
 * so this is where the A–E grade comes from.
 */

import { NextResponse } from "next/server";
import { analyseSignals } from "@/lib/agents/analysis";
import { withPayment } from "@/lib/x402/paywall";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Four futures endpoints in parallel, each with its own timeout. */
export const maxDuration = 30;

/** Aggregation windows Binance accepts for the futures data endpoints. */
const ALLOWED_PERIODS = ["5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d"];

export const GET = withPayment("signals", async (request, context) => {
  const params = new URL(request.url).searchParams;
  const symbol = params.get("symbol")?.toUpperCase() ?? "BTCUSDT";

  const requested = params.get("period") ?? "1h";
  const period = ALLOWED_PERIODS.includes(requested) ? requested : "1h";

  const data = await analyseSignals(symbol, period);

  return NextResponse.json({
    agent: "signals",
    paidBy: context.payer,
    transaction: context.transaction,
    data,
  });
});
