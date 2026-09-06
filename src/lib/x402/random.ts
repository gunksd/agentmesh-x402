/**
 * Randomness helpers backed by WebCrypto, which is available in both the Node
 * and Edge runtimes Next.js may pick for a route.
 */

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function hexlify(bytes: Uint8Array): `0x${string}` {
  let hex = "0x";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex as `0x${string}`;
}
