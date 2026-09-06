/**
 * Report Writer Agent — $0.05 per call, the most expensive in the mesh.
 *
 * Takes the other agents' output as input and returns a directional call. This
 * is the one agent that reads upstream findings rather than market data, so it
 * accepts POST with a JSON body.
 */

import { NextResponse } from "next/server";
import { composeReport, type ReportInput } from "@/lib/agents/analysis";
import { withPayment } from "@/lib/x402/paywall";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReportRequestBody {
  symbol?: string;
  findings?: ReportInput;
}

export const POST = withPayment("report", async (request, context) => {
  let body: ReportRequestBody = {};
  try {
    body = (await request.json()) as ReportRequestBody;
  } catch {
    // An empty body is valid — the report degrades to whatever it was given.
  }

  const symbol = body.symbol?.toUpperCase() ?? "BTCUSDT";
  const data = composeReport(symbol, body.findings ?? {});

  return NextResponse.json({
    agent: "report",
    paidBy: context.payer,
    transaction: context.transaction,
    data,
  });
});
