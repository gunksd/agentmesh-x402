/**
 * POST /api/facilitator/verify
 *
 * The `/verify` half of the facilitator, exposed over HTTP with the same request
 * and response shape as B402's `/papi/v2/b402/verify`. Off-chain only: no gas,
 * no state change. Any x402 merchant can point at this instead of Binance's
 * facilitator and get identical semantics.
 */

import { NextResponse } from "next/server";
import { verifyPayment } from "@/lib/x402/verify";
import type { PaymentPayload, PaymentRequirements } from "@/lib/x402/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface VerifyRequestBody {
  x402Version?: number;
  paymentPayload?: PaymentPayload;
  paymentRequirements?: PaymentRequirements;
}

export async function POST(request: Request) {
  let body: VerifyRequestBody;

  try {
    body = (await request.json()) as VerifyRequestBody;
  } catch {
    return NextResponse.json(
      { isValid: false, invalidReason: "malformed_request_body" },
      { status: 400 },
    );
  }

  const { paymentPayload, paymentRequirements } = body;
  if (!paymentPayload || !paymentRequirements) {
    return NextResponse.json(
      {
        isValid: false,
        invalidReason: "paymentPayload and paymentRequirements are required",
      },
      { status: 400 },
    );
  }

  try {
    const result = await verifyPayment(paymentPayload, paymentRequirements);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        isValid: false,
        invalidReason:
          error instanceof Error ? error.message : "verification_error",
      },
      { status: 500 },
    );
  }
}
