/**
 * Binance B402 facilitator client.
 *
 * Complete against Binance's documented contract, but unreachable without
 * merchant onboarding: production and sandbox base URLs are both "contact us
 * for access", gated behind clientId issuance, RSA public-key registration and
 * source-IP whitelisting. Apply at https://forms.gle/aUQvxUETfGMzyTky5
 *
 * Set B402_BASE_URL, B402_CLIENT_ID, B402_ACCESS_TOKEN and B402_PRIVATE_KEY to
 * route settlement through Binance instead of the self-built facilitator. No
 * other code changes — the payer never sees the difference.
 */

import { createSign } from "node:crypto";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "./types";

export interface B402Credentials {
  baseUrl: string;
  clientId: string;
  accessToken: string;
  /** Base64 PKCS#8 private key, single line. */
  privateKeyB64: string;
}

export function b402CredentialsFromEnv(): B402Credentials | null {
  const baseUrl = process.env.B402_BASE_URL;
  const clientId = process.env.B402_CLIENT_ID;
  const accessToken = process.env.B402_ACCESS_TOKEN;
  const privateKeyB64 = process.env.B402_PRIVATE_KEY;

  if (!baseUrl || !clientId || !accessToken || !privateKeyB64) return null;
  return { baseUrl, clientId, accessToken, privateKeyB64 };
}

/**
 * RSA-SHA256 over `body + timestamp`, base64-encoded, per Binance's request
 * signing spec. The timestamp in the signature and in the header must match.
 */
function signRequest(
  body: string,
  timestamp: string,
  privateKeyB64: string,
): string {
  const der = Buffer.from(privateKeyB64, "base64");
  const signer = createSign("RSA-SHA256");
  signer.update(body + timestamp, "utf8");
  signer.end();
  return signer
    .sign({ key: der, format: "der", type: "pkcs8" })
    .toString("base64");
}

async function callB402<T>(
  credentials: B402Credentials,
  path: string,
  body: unknown,
): Promise<T> {
  const payload = JSON.stringify(body ?? {});
  const timestamp = String(Date.now());

  const response = await fetch(`${credentials.baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tesla-ClientId": credentials.clientId,
      "X-Tesla-SignAccessToken": credentials.accessToken,
      "X-Tesla-Timestamp": timestamp,
      "X-Tesla-Signature": signRequest(
        payload,
        timestamp,
        credentials.privateKeyB64,
      ),
    },
    body: payload,
  });

  if (!response.ok) {
    throw new Error(`B402 ${path} returned ${response.status}`);
  }

  // Binance wraps responses in the BAPI envelope; the payload is under `data`.
  const envelope = (await response.json()) as { data?: T } & T;
  return (envelope.data ?? envelope) as T;
}

/** Payment kinds, tokens and signer addresses. Cache — changes infrequently. */
export function getSupported(credentials: B402Credentials) {
  return callB402<{
    kinds: Array<{
      scheme: string;
      network: string;
      asset: string;
      extra: Record<string, string>;
    }>;
    signers?: string[];
    extensions?: unknown;
  }>(credentials, "/papi/v2/b402/supported", {});
}

export function verifyViaB402(
  credentials: B402Credentials,
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
) {
  return callB402<VerifyResponse>(credentials, "/papi/v2/b402/verify", {
    x402Version: 2,
    paymentPayload,
    paymentRequirements,
  });
}

/** Idempotent — safe to poll while a settle is pending. */
export function settleViaB402(
  credentials: B402Credentials,
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
) {
  return callB402<SettleResponse>(credentials, "/papi/v2/b402/settle", {
    x402Version: 2,
    paymentPayload,
    paymentRequirements,
  });
}
