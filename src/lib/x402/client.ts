/**
 * Buyer-side x402 client.
 *
 * A fetch wrapper that handles the 402 challenge automatically: hit the
 * resource, get 402 with payment requirements, sign an EIP-712 authorization,
 * replay the request with the signature attached. No human in the loop, which
 * is the whole point — an agent pays another agent in one round trip.
 *
 * Deliberately built on plain fetch rather than @x402/fetch so the protocol
 * steps stay visible and the UI can report on each one.
 */

import {
  X402_HEADERS,
  decodeHeader,
  encodeHeader,
  type PaymentRequiredResponse,
  type PaymentRequirements,
  type SettleResponse,
} from "./types";
import { signPaymentRequirements } from "./signer";

export interface PaidFetchResult<T> {
  data: T;
  /** Requirements the merchant quoted. */
  requirements: PaymentRequirements;
  /** Settlement receipt from the PAYMENT-RESPONSE header. */
  settlement?: SettleResponse;
  timings: { quotedAt: number; signedAt: number; settledAt: number };
}

/**
 * Step hooks, so a caller can report progress as the protocol unfolds instead of
 * waiting for the round trip to finish.
 */
export interface PaidFetchHooks {
  onQuote?: (requirements: PaymentRequirements) => void;
  onSign?: (info: { payer: string; nonce: string; elapsedMs: number }) => void;
}

export class PaymentError extends Error {
  constructor(
    message: string,
    readonly reason: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

/**
 * Reads payment requirements from a 402 response.
 *
 * The PAYMENT-REQUIRED header wins over the body, because real endpoints on
 * Binance's B402 Bazaar carry different content in each: their body advertises
 * x402 v1 on Base for backward compatibility, while the header carries v2 with
 * additional options including BNB Smart Chain and eip3009. Reading only the
 * body — which this client originally did — makes an otherwise payable endpoint
 * look unsupported.
 */
async function readChallenge(
  response: Response,
): Promise<PaymentRequiredResponse> {
  const header = response.headers.get(X402_HEADERS.required);

  if (header) {
    try {
      const decoded = decodeHeader<PaymentRequiredResponse>(header);
      if (decoded.accepts?.length) return decoded;
    } catch {
      // Malformed header — the body is still worth trying.
    }
  }

  try {
    return (await response.json()) as PaymentRequiredResponse;
  } catch {
    throw new PaymentError(
      "402 response carried no readable payment requirements",
      "malformed_challenge",
      402,
    );
  }
}

/** Picks the requirement this client can actually satisfy. */
function selectRequirements(
  accepts: PaymentRequirements[],
): PaymentRequirements {
  const supported = accepts.find((r) => r.scheme === "permit2-exact");
  if (!supported) {
    throw new PaymentError(
      `No supported payment scheme among: ${accepts.map((r) => r.scheme).join(", ")}`,
      "unsupported_scheme",
      402,
    );
  }
  return supported;
}

/**
 * Fetches a resource, paying for it if the server demands payment.
 *
 * @param url        Resource to fetch.
 * @param privateKey Paying agent's key.
 * @param init       Standard fetch options, reused verbatim on the retry.
 */
export async function paidFetch<T>(
  url: string,
  privateKey: `0x${string}`,
  init: RequestInit = {},
  hooks: PaidFetchHooks = {},
): Promise<PaidFetchResult<T>> {
  const quotedAt = Date.now();
  const first = await fetch(url, { ...init, cache: "no-store" });

  // Free resource, or already paid via a cached authorization.
  if (first.status !== 402) {
    if (!first.ok) {
      throw new PaymentError(
        `Resource returned ${first.status}`,
        "resource_error",
        first.status,
      );
    }
    const data = (await first.json()) as T;
    return {
      data,
      requirements: {} as PaymentRequirements,
      timings: { quotedAt, signedAt: quotedAt, settledAt: Date.now() },
    };
  }

  const challenge = await readChallenge(first);
  const requirements = selectRequirements(challenge.accepts ?? []);
  hooks.onQuote?.(requirements);

  const payload = await signPaymentRequirements(requirements, privateKey);
  const signedAt = Date.now();

  hooks.onSign?.({
    payer: payload.payload.permit2Authorization.from,
    nonce: payload.payload.permit2Authorization.nonce,
    elapsedMs: signedAt - quotedAt,
  });

  const second = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init.headers ?? {}),
      [X402_HEADERS.signature]: encodeHeader(payload),
    },
  });

  // Settlement in flight. The merchant will resolve it; surface as retryable.
  if (second.status === 202) {
    const pending = (await second.json()) as { transaction?: string };
    throw new PaymentError(
      `Settlement pending${pending.transaction ? ` (${pending.transaction})` : ""}`,
      "settlement_pending",
      202,
    );
  }

  if (second.status === 402) {
    const rejection = (await second.json()) as PaymentRequiredResponse;
    throw new PaymentError(
      `Payment rejected: ${rejection.error}`,
      rejection.error,
      402,
    );
  }

  if (!second.ok) {
    throw new PaymentError(
      `Resource returned ${second.status} after payment`,
      "resource_error_after_payment",
      second.status,
    );
  }

  const receipt = second.headers.get(X402_HEADERS.response);

  return {
    data: (await second.json()) as T,
    requirements,
    settlement: receipt ? decodeHeader<SettleResponse>(receipt) : undefined,
    timings: { quotedAt, signedAt, settledAt: Date.now() },
  };
}
