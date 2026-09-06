/**
 * Off-chain verification, the `/verify` half of a facilitator.
 *
 * Checks the EIP-712 signature, the authorization's time window, that it
 * matches what the merchant asked for, and that the payer holds enough balance.
 * Deliberately mirrors B402's error vocabulary so a swap to Binance's
 * facilitator produces the same reasons.
 */

import { verifyTypedData } from "viem";
import { ERC20_ABI } from "./abi";
import { publicClient } from "./clients";
import {
  PERMIT2_PRIMARY_TYPE,
  PERMIT2_TYPES,
  chainIdFromCaip2,
  permit2Domain,
  toTypedMessage,
} from "./permit2";
import type {
  PaymentPayload,
  PaymentRequirements,
  VerifyResponse,
} from "./types";

/** Error reasons, matching B402's documented vocabulary. */
export const INVALID_REASONS = {
  network: "invalid_network",
  scheme: "invalid_scheme",
  signature: "invalid_exact_evm_payload_signature",
  recipient: "invalid_exact_evm_payload_recipient_mismatch",
  asset: "invalid_exact_evm_payload_asset_mismatch",
  amount: "invalid_exact_evm_payload_amount_mismatch",
  expired: "invalid_exact_evm_payload_authorization_expired",
  notYetValid: "invalid_exact_evm_payload_authorization_not_yet_valid",
  balance: "insufficient_funds",
} as const;

function invalid(reason: string, payer?: string): VerifyResponse {
  return { isValid: false, invalidReason: reason, payer };
}

export async function verifyPayment(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
): Promise<VerifyResponse> {
  const auth = payload.payload.permit2Authorization;
  const payer = auth.from;

  if (payload.network !== requirements.network) {
    return invalid(INVALID_REASONS.network, payer);
  }
  if (payload.scheme !== requirements.scheme) {
    return invalid(INVALID_REASONS.scheme, payer);
  }

  // The merchant must get paid the agreed amount, in the agreed token, at the
  // agreed address. A signature over different terms is not payment.
  if (
    auth.witness.to.toLowerCase() !== requirements.payTo.toLowerCase()
  ) {
    return invalid(INVALID_REASONS.recipient, payer);
  }
  if (
    auth.permitted.token.toLowerCase() !== requirements.asset.toLowerCase()
  ) {
    return invalid(INVALID_REASONS.asset, payer);
  }
  if (BigInt(auth.permitted.amount) < BigInt(requirements.amount)) {
    return invalid(INVALID_REASONS.amount, payer);
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  if (BigInt(auth.deadline) <= now) {
    return invalid(INVALID_REASONS.expired, payer);
  }
  if (BigInt(auth.witness.validAfter) > now) {
    return invalid(INVALID_REASONS.notYetValid, payer);
  }

  const chainId = chainIdFromCaip2(payload.network);
  const signatureValid = await verifyTypedData({
    address: payer as `0x${string}`,
    domain: permit2Domain(chainId),
    types: PERMIT2_TYPES,
    primaryType: PERMIT2_PRIMARY_TYPE,
    message: toTypedMessage(auth),
    signature: payload.payload.signature,
  });

  if (!signatureValid) {
    return invalid(INVALID_REASONS.signature, payer);
  }

  const balance = await publicClient.readContract({
    address: auth.permitted.token as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [payer as `0x${string}`],
  });

  if (balance < BigInt(requirements.amount)) {
    return invalid(INVALID_REASONS.balance, payer);
  }

  return { isValid: true, payer };
}
