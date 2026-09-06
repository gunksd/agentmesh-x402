/**
 * On-chain settlement, the `/settle` half of a facilitator.
 *
 * A detail that shapes this whole design: Permit2 verifies the signature
 * against a struct whose `spender` is `msg.sender`. Whoever calls Permit2 must
 * therefore be the address the payer signed as spender.
 *
 *   - Self-built path (here): the relayer EOA calls Permit2 directly, so we
 *     advertise `extra.spenderAddress = relayer address`.
 *   - B402 path: Binance routes through a Permit2 proxy contract, so their
 *     `/supported` advertises that proxy instead.
 *
 * Payer code is identical either way because it only ever reads
 * `extra.spenderAddress` out of the 402 response. That is what makes the
 * facilitator swappable by configuration alone.
 *
 * The relayer pays gas, matching B402's gas-sponsorship guarantee: the paying
 * agent needs no BNB, only a signature.
 */

import { encodeAbiParameters, keccak256, parseAbiParameters } from "viem";
import { PERMIT2_ABI, PERMIT2_WITNESS_TYPE_STRING } from "./abi";
import { publicClient, relayerClient } from "./clients";
import { allocateNonce, releaseNonce } from "./nonce";
import { PERMIT2_ADDRESS } from "@/lib/chain";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
} from "./types";

/** EIP-712 type hash of the witness struct. */
const WITNESS_TYPEHASH = keccak256(
  new TextEncoder().encode("Witness(address to,uint256 validAfter)"),
);

/**
 * Hashes the witness for the on-chain call. Must reproduce exactly what the
 * payer signed, or Permit2 recovers a different signer and reverts.
 */
export function hashWitness(to: string, validAfter: string): `0x${string}` {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32, address, uint256"), [
      WITNESS_TYPEHASH,
      to as `0x${string}`,
      BigInt(validAfter),
    ]),
  );
}

/**
 * Submits the transfer and waits for inclusion.
 *
 * Returns `success: false` with no `errorReason` while a transaction is
 * in-flight, matching B402's pending semantics — callers poll until it resolves.
 */
/** How many times to re-reserve a nonce after a collision. */
const MAX_NONCE_ATTEMPTS = 5;

/**
 * Settles a payment, retrying when the relayer's account nonce collides.
 *
 * Retrying is what makes concurrency work across serverless instances. The
 * in-process allocator cannot see reservations made by a sibling instance, so a
 * clash is expected rather than exceptional: on collision we drop the cache,
 * re-read the chain, and try again with a short jittered backoff.
 *
 * Only nonce clashes retry. A reverted transfer or an expired authorisation
 * would fail identically every time, and retrying those would just burn gas.
 */
export async function settlePayment(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
): Promise<SettleResponse> {
  let last: SettleResponse | null = null;

  for (let attempt = 1; attempt <= MAX_NONCE_ATTEMPTS; attempt += 1) {
    last = await attemptSettle(payload, requirements);

    if (last.success || last.errorReason !== "relayer_nonce_collision") {
      return last;
    }

    // Jitter so parallel instances that collided do not retry in lockstep.
    const backoff = 120 * attempt + Math.floor(Math.random() * 180);
    await new Promise((resolve) => setTimeout(resolve, backoff));
  }

  return last as SettleResponse;
}

async function attemptSettle(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
): Promise<SettleResponse> {
  const auth = payload.payload.permit2Authorization;
  const wallet = relayerClient();

  // Reserve a distinct nonce so concurrent settlements do not collide. Within
  // one process this is authoritative; across instances the retry above covers
  // what this cannot see.
  const relayer = wallet.account.address;
  const nonce = await allocateNonce(relayer);

  try {
    const hash = await wallet.writeContract({
      nonce,
      address: PERMIT2_ADDRESS,
      abi: PERMIT2_ABI,
      functionName: "permitWitnessTransferFrom",
      args: [
        {
          permitted: {
            token: auth.permitted.token as `0x${string}`,
            amount: BigInt(auth.permitted.amount),
          },
          nonce: BigInt(auth.nonce),
          deadline: BigInt(auth.deadline),
        },
        {
          to: requirements.payTo as `0x${string}`,
          requestedAmount: BigInt(requirements.amount),
        },
        auth.from as `0x${string}`,
        hashWitness(auth.witness.to, auth.witness.validAfter),
        PERMIT2_WITNESS_TYPE_STRING,
        payload.payload.signature,
      ],
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout: 60_000,
    });

    if (receipt.status !== "success") {
      return {
        success: false,
        transaction: hash,
        network: payload.network,
        payer: auth.from,
        errorReason: "transaction_reverted",
      };
    }

    return {
      success: true,
      transaction: hash,
      network: payload.network,
      payer: auth.from,
    };
  } catch (error) {
    // The reserved nonce was never mined, so every later one is now too high and
    // would sit unmineable. Drop the cache and re-read the chain next time.
    releaseNonce(relayer);

    const reason = settleErrorReason(error);

    // Log the raw error whenever it did not match a known pattern. Returning a
    // bare "settlement_failed" hides exactly the cases worth diagnosing.
    if (reason === "settlement_failed") {
      console.error(
        "[settle] unrecognised failure:",
        error instanceof Error ? error.message : error,
      );
    }

    return {
      success: false,
      network: payload.network,
      payer: auth.from,
      errorReason: reason,
    };
  }
}

/**
 * Maps common reverts to B402's error vocabulary.
 *
 * TRANSFER_FROM_FAILED is the one that bites in practice: /verify does not
 * check the payer's ERC-20 approval, so an unapproved wallet passes
 * verification and only fails here.
 */
function settleErrorReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/TRANSFER_FROM_FAILED|ERC20: transfer amount exceeds allowance/i.test(message)) {
    return "TRANSFER_FROM_FAILED";
  }
  if (/InvalidNonce/i.test(message)) {
    return "nonce_already_used";
  }
  if (/SignatureExpired/i.test(message)) {
    return "authorization_expired";
  }
  if (/InvalidSigner|InvalidSignature/i.test(message)) {
    return "invalid_exact_evm_payload_signature";
  }
  if (/insufficient funds/i.test(message)) {
    return "relayer_out_of_gas";
  }
  if (isNonceCollision(message)) {
    return "relayer_nonce_collision";
  }
  return "settlement_failed";
}

/**
 * Recognises an account-nonce clash on the relayer.
 *
 * This is the failure mode that only appears in production. The nonce allocator
 * caches per process, but every agent endpoint runs as its own serverless
 * instance, so four parallel payments each read the same pending nonce from a
 * separate process and the RPC accepts exactly one. Locally a single dev server
 * shares one cache, which is why it never reproduced there.
 *
 * BSC nodes phrase this several ways and none of them mention "nonce"
 * consistently, so match the family rather than one string.
 */
function isNonceCollision(message: string): boolean {
  return /nonce too low|nonce too high|already known|replacement transaction underpriced|invalid parameters|already imported|known transaction/i.test(
    message,
  );
}
