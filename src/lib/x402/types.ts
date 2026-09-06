/**
 * x402 v2 wire types.
 *
 * Field names mirror the x402 v2 specification so that a payload produced here
 * is accepted by Binance B402's facilitator without translation. Numeric values
 * that are signed as uint256 travel as decimal strings — the signed value and
 * the wire string must match exactly or signature recovery fails.
 */

/** Payment scheme. B402 supports permit2-exact for any ERC-20. */
export type PaymentScheme = "permit2-exact" | "permit2-upto" | "eip3009";

/**
 * The `extra` block a merchant echoes verbatim from `/supported` into its 402
 * response. Buyers cannot call `/supported` themselves, so this is their only
 * source for building the EIP-712 domain and locating the Permit2 proxy.
 */
export interface PaymentRequirementsExtra {
  name: string;
  assetTransferMethod: PaymentScheme;
  /** Permit2 proxy contract — the EIP-712 `spender`. Not the facilitator EOA. */
  spenderAddress: `0x${string}`;
  /** Facilitator EOA. Present for permit2-upto flows only. */
  signerAddress?: `0x${string}`;
}

export interface PaymentRequirements {
  scheme: PaymentScheme;
  /** CAIP-2, e.g. "eip155:97". */
  network: string;
  /** Atomic units, decimal string. Settled 1:1. */
  amount: string;
  /** ERC-20 contract address of the settlement token. */
  asset: string;
  /** Recipient of the transfer. */
  payTo: string;
  /** Absolute URL of the resource being paid for. */
  resource: string;
  description: string;
  mimeType: string;
  /** Seconds the payer has to produce a signature. */
  maxTimeoutSeconds: number;
  extra: PaymentRequirementsExtra;
}

/** Body of the 402 response, also base64-encoded into PAYMENT-REQUIRED. */
export interface PaymentRequiredResponse {
  x402Version: 2;
  error: string;
  accepts: PaymentRequirements[];
}

export interface TokenPermissions {
  token: string;
  amount: string;
}

export interface PermitWitness {
  to: string;
  validAfter: string;
}

/** The EIP-712 message the payer signs, plus the recovered signer. */
export interface Permit2Authorization {
  permitted: TokenPermissions;
  from: string;
  spender: string;
  nonce: string;
  deadline: string;
  witness: PermitWitness;
}

export interface PaymentPayload {
  x402Version: 2;
  scheme: PaymentScheme;
  network: string;
  payload: {
    /** 0x-prefixed 65-byte hex, r || s || v, unmodified. */
    signature: `0x${string}`;
    permit2Authorization: Permit2Authorization;
  };
  /** Optional B402 Bazaar discovery metadata, attached on settle. */
  extensions?: Record<string, unknown>;
}

export interface VerifyResponse {
  isValid: boolean;
  invalidReason?: string;
  payer?: string;
}

export interface SettleResponse {
  success: boolean;
  /** Present on success and on pending. */
  transaction?: string;
  network?: string;
  payer?: string;
  /**
   * Absent while pending. `success: false` with no errorReason means the
   * merchant should poll /settle again — the endpoint is idempotent.
   */
  errorReason?: string;
}

/** x402 v2 header names. All values are base64-encoded JSON. */
export const X402_HEADERS = {
  required: "PAYMENT-REQUIRED",
  signature: "PAYMENT-SIGNATURE",
  response: "PAYMENT-RESPONSE",
} as const;

export function encodeHeader(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

export function decodeHeader<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64").toString("utf8")) as T;
}
