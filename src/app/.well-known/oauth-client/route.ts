/**
 * GET /.well-known/oauth-client
 *
 * The client_id metadata document. Binance's authorization server has no
 * registration endpoint (`/register` returns 404) and advertises
 * `client_id_metadata_document_supported: true`, so a client identifies itself
 * by hosting this document at a URL that *is* its client_id.
 *
 * Consequence worth noting: this must be publicly reachable for the OAuth flow
 * to work, which means MCP authorisation only completes against a deployed
 * origin, not localhost.
 */

import { NextResponse } from "next/server";
import { MCP_SCOPES, clientId, redirectUri } from "@/lib/mcp/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      client_id: clientId(),
      client_name: "AgentMesh",
      client_uri: clientId().replace("/.well-known/oauth-client", ""),
      redirect_uris: [redirectUri()],
      // Public client: PKCE instead of a secret, per the server's
      // token_endpoint_auth_methods_supported: ["none"].
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: MCP_SCOPES.join(" "),
    },
    {
      headers: {
        // Binance fetches this during authorisation; allow brief caching.
        "cache-control": "public, max-age=300",
      },
    },
  );
}
