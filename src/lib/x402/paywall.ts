/**
 * Merchant-side x402 guard.
 *
 * Wraps a route handler so it returns 402 until a valid payment arrives:
 *
 *   1. No PAYMENT-SIGNATURE header  → 402 + paymentRequirements
 *   2. Header present               → verify off-chain, then settle on-chain
 *   3. Settled                      → run the handler, attach PAYMENT-RESPONSE
 *
 * Verify-then-settle ordering matters. Verification is free and catches bad
 * signatures before we spend gas; settlement is the irreversible step and only
 * runs once the authorization is known good.
 */

import { NextResponse } from "next/server";
import { settle, verify } from "./facilitator";
import {
  X402_HEADERS,
  decodeHeader,
  encodeHeader,
  type PaymentPayload,
  type PaymentRequiredResponse,
  type PaymentRequirements,
  type SettleResponse,
} from "./types";
import { buildRequirements } from "./requirements";
import { AGENTS, type AgentSkill } from "@/lib/agents/registry";

export interface PaidContext {
  /** Address that paid for this call. */
  payer: string;
  /** Settlement transaction hash. */
  transaction?: string;
  requirements: PaymentRequirements;
}

type PaidHandler = (
  request: Request,
  context: PaidContext,
) => Promise<NextResponse> | NextResponse;

/** 402 response carrying what the buyer must pay. */
function paymentRequired(
  requirements: PaymentRequirements,
  error: string,
): NextResponse {
  const body: PaymentRequiredResponse = {
    x402Version: 2,
    error,
    accepts: [requirements],
  };

  return NextResponse.json(body, {
    status: 402,
    headers: { [X402_HEADERS.required]: encodeHeader(body) },
  });
}

export function withPayment(skill: AgentSkill, handler: PaidHandler) {
  return async function paidRoute(request: Request): Promise<NextResponse> {
    const agent = AGENTS[skill];
    const requirements = buildRequirements(agent, request.url);

    const header = request.headers.get(X402_HEADERS.signature);
    if (!header) {
      return paymentRequired(requirements, "payment_required");
    }

    let payload: PaymentPayload;
    try {
      payload = decodeHeader<PaymentPayload>(header);
    } catch {
      return paymentRequired(requirements, "malformed_payment_signature");
    }

    const verification = await verify(payload, requirements);
    if (!verification.isValid) {
      return paymentRequired(
        requirements,
        verification.invalidReason ?? "verification_failed",
      );
    }

    const settlement: SettleResponse = await settle(payload, requirements);

    // success: false with no errorReason means the transfer is still in flight.
    if (!settlement.success) {
      if (!settlement.errorReason) {
        return NextResponse.json(
          {
            x402Version: 2,
            status: "pending",
            transaction: settlement.transaction,
          },
          { status: 202 },
        );
      }
      return paymentRequired(requirements, settlement.errorReason);
    }

    const response = await handler(request, {
      payer: settlement.payer ?? verification.payer ?? "",
      transaction: settlement.transaction,
      requirements,
    });

    response.headers.set(X402_HEADERS.response, encodeHeader(settlement));
    return response;
  };
}
