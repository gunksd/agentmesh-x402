/**
 * Report Writer Agent — $0.05 per call, the most expensive in the mesh.
 *
 * Takes the other agents' output as input and returns a directional call. This
 * is the one agent that reads upstream findings rather than market data, so it
 * accepts POST with a JSON body.
 */

import { NextResponse } from "next/server";
import { composeReport, type ReportInput } from "@/lib/agents/analysis";
import { previewOrder } from "@/lib/agents/order";
import { withPayment } from "@/lib/x402/paywall";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReportRequestBody {
  symbol?: string;
  findings?: ReportInput;
  /** Budget the order preview is sized against. */
  budgetUsd?: number;
}

export const POST = withPayment("report", async (request, context) => {
  let body: ReportRequestBody = {};
  try {
    body = (await request.json()) as ReportRequestBody;
  } catch {
    // An empty body is valid — the report degrades to whatever it was given.
  }

  const symbol = body.symbol?.toUpperCase() ?? "BTCUSDT";
  const findings = body.findings ?? {};
  const data = composeReport(symbol, findings);

  // The order preview is the deliverable's payoff: concrete parameters a human
  // can approve. Producing them needs no trade scope, and this project holds none.
  const orderPreview = previewOrder(
    symbol,
    data.direction,
    data.confidence,
    body.budgetUsd ?? findings.risk?.notionalUsd ?? 10_000,
    findings.depth,
    findings.risk,
  );

  return NextResponse.json({
    agent: "report",
    paidBy: context.payer,
    transaction: context.transaction,
    data: { ...data, orderPreview },
  });
});
