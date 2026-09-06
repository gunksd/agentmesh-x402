/**
 * Facilitator selection.
 *
 * Two interchangeable implementations behind one interface:
 *
 *   self  — verifies signatures locally and calls Permit2 directly, with a
 *           relayer EOA sponsoring gas. Real transfers on BNB Smart Chain.
 *   b402  — delegates to Binance's facilitator. Requires merchant onboarding.
 *
 * Selection is automatic: if B402 credentials are present, use B402. Otherwise
 * fall back to self. Force either with X402_FACILITATOR=self|b402.
 */

import { b402CredentialsFromEnv, settleViaB402, verifyViaB402 } from "./b402";
import { settlePayment } from "./settle";
import { verifyPayment } from "./verify";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "./types";

export type FacilitatorMode = "self" | "b402";

export function activeFacilitator(): FacilitatorMode {
  const forced = process.env.X402_FACILITATOR;
  if (forced === "self" || forced === "b402") return forced;
  return b402CredentialsFromEnv() ? "b402" : "self";
}

export function facilitatorLabel(mode: FacilitatorMode): string {
  return mode === "b402"
    ? "Binance B402"
    : "AgentMesh facilitator (x402 v2 compatible)";
}

export async function verify(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
): Promise<VerifyResponse> {
  const credentials = b402CredentialsFromEnv();
  if (activeFacilitator() === "b402" && credentials) {
    return verifyViaB402(credentials, payload, requirements);
  }
  return verifyPayment(payload, requirements);
}

export async function settle(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
): Promise<SettleResponse> {
  const credentials = b402CredentialsFromEnv();
  if (activeFacilitator() === "b402" && credentials) {
    return settleViaB402(credentials, payload, requirements);
  }
  return settlePayment(payload, requirements);
}
