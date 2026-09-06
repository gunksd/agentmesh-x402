/**
 * Payer-side signing. Pure local EIP-712 — no RPC, no provider, no gas.
 *
 * This is what makes agent-to-agent payment viable: the paying agent signs an
 * authorization offline in microseconds, and the facilitator submits the
 * transfer on-chain while sponsoring gas.
 */

import { privateKeyToAccount } from "viem/accounts";
import {
  PERMIT2_PRIMARY_TYPE,
  PERMIT2_TYPES,
  buildAuthorization,
  chainIdFromCaip2,
  permit2Domain,
  toPaymentPayload,
  toTypedMessage,
} from "./permit2";
import type { PaymentPayload, PaymentRequirements } from "./types";

/**
 * Signs payment requirements and returns the x402 v2 payload.
 *
 * @param requirements Parsed from the merchant's 402 response.
 * @param privateKey   Paying agent's key. In production this belongs in a KMS
 *                     or the Binance Agentic Wallet rather than an env var.
 */
export async function signPaymentRequirements(
  requirements: PaymentRequirements,
  privateKey: `0x${string}`,
  extensions?: Record<string, unknown>,
): Promise<PaymentPayload> {
  const account = privateKeyToAccount(privateKey);
  const chainId = chainIdFromCaip2(requirements.network);
  const auth = buildAuthorization(requirements, account.address);

  const signature = await account.signTypedData({
    domain: permit2Domain(chainId),
    types: PERMIT2_TYPES,
    primaryType: PERMIT2_PRIMARY_TYPE,
    message: toTypedMessage(auth),
  });

  return toPaymentPayload(requirements, signature, auth, extensions);
}

/** Address the configured payer key resolves to. */
export function payerAddress(privateKey: `0x${string}`): `0x${string}` {
  return privateKeyToAccount(privateKey).address;
}
