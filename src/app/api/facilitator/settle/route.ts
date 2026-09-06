/**
 * POST /api/facilitator/settle
 *
 * The `/settle` half of the facilitator. Submits the Permit2 transfer on BNB
 * Smart Chain with the relayer sponsoring gas, mirroring B402's gas-sponsorship
 * guarantee — the paying agent never needs BNB.
 *
 * Verification runs again here rather than trusting the caller: settle is the
 * irreversible step, and this endpoint is reachable independently of the paywall.
 */

import { NextResponse } from "next/server";
import { settlePayment } from "@/lib/x402/settle";
import { verifyPayment } from "@/lib/x402/verify";
import type { PaymentPayload, PaymentRequirements } from "@/lib/x402/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Settlement waits on block inclusion, so allow more than the default. */
export const maxDuration = 60;

interface SettleRequestBody {
  x402Version?: number;
  paymentPayload?: PaymentPayload;
  paymentRequirements?: PaymentRequirements;
}

export async function POST(request: Request) {
  let body: SettleRequestBody;

  try {
    body = (await request.json()) as SettleRequestBody;
  } catch {
    return NextResponse.json(
      { success: false, errorReason: "malformed_request_body" },
      { status: 400 },
    );
  }

  const { paymentPayload, paymentRequirements } = body;
  if (!paymentPayload || !paymentRequirements) {
    return NextResponse.json(
      {
        success: false,
        errorReason: "paymentPayload and paymentRequirements are required",
      },
      { status: 400 },
    );
  }

  const verification = await verifyPayment(paymentPayload, paymentRequirements);
  if (!verification.isValid) {
    return NextResponse.json(
      {
        success: false,
        payer: verification.payer,
        errorReason: verification.invalidReason ?? "verification_failed",
      },
      { status: 400 },
    );
  }

  try {
    const result = await settlePayment(paymentPayload, paymentRequirements);
    return NextResponse.json(result, { status: result.success ? 200 : 502 });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        errorReason:
          error instanceof Error ? error.message : "settlement_error",
      },
      { status: 500 },
    );
  }
}
