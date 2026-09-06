/**
 * Binance Agent OS MCP configuration.
 *
 * The connection is OAuth 2.1: PKCE, no client secret, and — notably — no
 * registration call. Binance's authorization server advertises
 * `client_id_metadata_document_supported: true`, and `/register` returns 404,
 * so the client identifies itself by hosting a metadata document whose URL *is*
 * the client_id. That means no credential application, unlike B402's facilitator.
 *
 * Discovered from the live server:
 *   authorization_endpoint  accounts.binance.com/agentic-oauth/authorize
 *   token_endpoint          accounts.binance.com/oauth-agentic/token
 *   auth methods            ["none"]   → public client
 *   code challenge          ["S256"]   → PKCE required
 */

/** Streamable HTTP endpoint. Must match exactly; not browsable. */
export const MCP_ENDPOINT = "https://agent.binance.com/mcp/agentic";

export const OAUTH_AUTHORIZE_URL =
  "https://accounts.binance.com/agentic-oauth/authorize";

export const OAUTH_TOKEN_URL =
  "https://accounts.binance.com/oauth-agentic/token";

/**
 * Scopes this project requests.
 *
 * Read-only by design. `trade` and `transfer` are deliberately omitted: the
 * report agent produces order parameters for a human to confirm rather than
 * placing orders itself, so the connection never needs write access.
 */
export const MCP_SCOPES = ["market_data", "account"] as const;

/** Absolute origin of this deployment, used for client_id and redirect_uri. */
export function appOrigin(): string {
  const configured = process.env.AGENTMESH_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}

/**
 * The client_id is the URL of our hosted metadata document. Binance fetches it
 * to learn our redirect URIs and client name.
 */
export function clientId(): string {
  return `${appOrigin()}/.well-known/oauth-client`;
}

export function redirectUri(): string {
  return `${appOrigin()}/api/mcp/callback`;
}

/** Whether a connection has been authorised and tokens are available. */
export function mcpConfigured(): boolean {
  return Boolean(process.env.MCP_REFRESH_TOKEN);
}
