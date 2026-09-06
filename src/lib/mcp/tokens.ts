/**
 * Access token management for the MCP connection.
 *
 * The refresh token comes from a one-time browser authorisation and lives in
 * MCP_REFRESH_TOKEN. Access tokens are short-lived, so they are exchanged on
 * demand and cached in module scope for the life of the process.
 *
 * Concurrency matters here: four agents read market data at once, and each
 * noticing an expired token independently would fire four refreshes and likely
 * have three rejected. Refreshes are therefore de-duplicated — the first caller
 * starts one and the rest await the same promise.
 */

import { MCP_ENDPOINT, OAUTH_TOKEN_URL, clientId } from "./config";

interface CachedToken {
  accessToken: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

let cached: CachedToken | null = null;
let inFlight: Promise<string> | null = null;

/** Refresh this long before nominal expiry to absorb clock skew and latency. */
const EXPIRY_MARGIN_MS = 60_000;

interface RefreshResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

export class McpAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpAuthError";
  }
}

async function refresh(): Promise<string> {
  const refreshToken = process.env.MCP_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new McpAuthError(
      "MCP_REFRESH_TOKEN is not set — authorise once at /api/mcp/connect.",
    );
  }

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId(),
      resource: MCP_ENDPOINT,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const payload = (await response.json()) as RefreshResponse;

  if (!response.ok || payload.error || !payload.access_token) {
    throw new McpAuthError(
      `Token refresh failed: ${payload.error ?? response.status}${
        payload.error_description ? ` (${payload.error_description})` : ""
      }`,
    );
  }

  // Default to 15 minutes when the server omits expires_in.
  const lifetimeMs = (payload.expires_in ?? 900) * 1000;
  cached = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + lifetimeMs,
  };

  return payload.access_token;
}

/** Returns a valid access token, refreshing if the cached one is near expiry. */
export async function accessToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt - EXPIRY_MARGIN_MS) {
    return cached.accessToken;
  }

  // Collapse concurrent refreshes into one request.
  if (!inFlight) {
    inFlight = refresh().finally(() => {
      inFlight = null;
    });
  }

  return inFlight;
}

/** Drops the cached token so the next call re-authenticates. Used after a 401. */
export function invalidateToken(): void {
  cached = null;
}
