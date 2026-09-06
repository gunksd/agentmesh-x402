/**
 * Permit2 EIP-712 signing for the x402 `permit2-exact` scheme.
 *
 * Three constraints from Binance's Permit2 signing guide are load-bearing here
 * and each one silently breaks signature recovery if violated:
 *
 *   1. The domain has NO `version` field. Adding one shifts the domain
 *      separator and /verify rejects with invalid_exact_evm_payload_signature.
 *   2. The witness struct must be named exactly `Witness`.
 *   3. Field order within each struct is part of the type hash.
 *
 * Separately: /verify does not check the payer's ERC-20 approval, so a wallet
 * that never approved Permit2 passes verification and only fails at settle with
 * TRANSFER_FROM_FAILED. Callers should ensure approval up front.
 */

import { hexlify, randomBytes } from "./random";
import { PERMIT2_ADDRESS } from "@/lib/chain";
import type {
  PaymentPayload,
  PaymentRequirements,
  Permit2Authorization,
} from "./types";

/** Seconds a signed authorization stays valid. */
const DEADLINE_WINDOW_SECONDS = 3600;

/** Backdate validAfter to absorb clock skew between payer and facilitator. */
const CLOCK_SKEW_SECONDS = 60;

/**
 * EIP-712 type definitions. Do not add EIP712Domain — viem derives it and
 * rejects a manual entry.
 */
export const PERMIT2_TYPES = {
  PermitWitnessTransferFrom: [
    { name: "permitted", type: "TokenPermissions" },
    { name: "spender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "witness", type: "Witness" },
  ],
  TokenPermissions: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
  ],
  Witness: [
    { name: "to", type: "address" },
    { name: "validAfter", type: "uint256" },
  ],
} as const;

export const PERMIT2_PRIMARY_TYPE = "PermitWitnessTransferFrom" as const;

/** Builds the EIP-712 domain. Three fields only — no `version`. */
export function permit2Domain(chainId: number) {
  return {
    name: "Permit2",
    chainId,
    verifyingContract: PERMIT2_ADDRESS,
  } as const;
}

/** Extracts the numeric chain id from a CAIP-2 network string. */
export function chainIdFromCaip2(network: string): number {
  const [namespace, reference] = network.split(":");
  if (namespace !== "eip155" || !reference) {
    throw new Error(`Unsupported network for permit2 signing: ${network}`);
  }
  const chainId = Number(reference);
  if (!Number.isInteger(chainId)) {
    throw new Error(`Malformed CAIP-2 network: ${network}`);
  }
  return chainId;
}

/**
 * Permit2 tracks nonces in a bitmap rather than sequentially, so a fresh
 * 256-bit random value is the correct choice — no on-chain read required.
 */
export function randomNonce(): string {
  return BigInt(hexlify(randomBytes(32))).toString();
}

/**
 * Assembles the authorization from payment requirements.
 *
 * `spender` comes from `extra.spenderAddress` (the Permit2 proxy), never from
 * `extra.signerAddress` (the facilitator EOA). Read it fresh from /supported
 * on each run — it changes if the proxy is redeployed.
 */
export function buildAuthorization(
  requirements: PaymentRequirements,
  from: string,
): Permit2Authorization {
  const now = Math.floor(Date.now() / 1000);

  return {
    permitted: {
      token: requirements.asset,
      amount: requirements.amount,
    },
    from,
    spender: requirements.extra.spenderAddress,
    nonce: randomNonce(),
    deadline: String(now + DEADLINE_WINDOW_SECONDS),
    witness: {
      to: requirements.payTo,
      validAfter: String(now - CLOCK_SKEW_SECONDS),
    },
  };
}

/**
 * The message shape passed to signTypedData. Values are bigint so viem encodes
 * them as uint256; they are converted back to decimal strings on the wire.
 */
export function toTypedMessage(auth: Permit2Authorization) {
  return {
    permitted: {
      token: auth.permitted.token as `0x${string}`,
      amount: BigInt(auth.permitted.amount),
    },
    spender: auth.spender as `0x${string}`,
    nonce: BigInt(auth.nonce),
    deadline: BigInt(auth.deadline),
    witness: {
      to: auth.witness.to as `0x${string}`,
      validAfter: BigInt(auth.witness.validAfter),
    },
  } as const;
}

/** Wraps a signature and authorization into the x402 v2 wire envelope. */
export function toPaymentPayload(
  requirements: PaymentRequirements,
  signature: `0x${string}`,
  auth: Permit2Authorization,
  extensions?: Record<string, unknown>,
): PaymentPayload {
  return {
    x402Version: 2,
    scheme: requirements.scheme,
    network: requirements.network,
    payload: { signature, permit2Authorization: auth },
    ...(extensions ? { extensions } : {}),
  };
}
