/**
 * PKCE helpers.
 *
 * Binance's authorization server advertises `code_challenge_methods_supported:
 * ["S256"]` and `token_endpoint_auth_methods_supported: ["none"]`, so PKCE is
 * the only thing binding the token exchange to the party that started the flow.
 */

/** Base64url without padding, as RFC 7636 requires. */
function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export async function createPkcePair(): Promise<PkcePair> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

/** Opaque value tying the callback back to the request that began the flow. */
export function createState(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(16)));
}
