/**
 * GET /api/mcp/connect
 *
 * Starts the Agent OS MCP authorisation flow. Generates a PKCE pair, stashes the
 * verifier in an httpOnly cookie, and redirects to Binance's consent screen.
 *
 * The verifier goes in a cookie rather than server memory so the flow survives a
 * serverless instance being recycled between the redirect and the callback.
 */

import { NextResponse } from "next/server";
import {
  MCP_ENDPOINT,
  MCP_SCOPES,
  OAUTH_AUTHORIZE_URL,
  clientId,
  redirectUri,
} from "@/lib/mcp/config";
import { createPkcePair, createState } from "@/lib/mcp/pkce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The flow is interactive; a short window is plenty and limits exposure. */
const COOKIE_MAX_AGE_SECONDS = 600;

export async function GET() {
  const { verifier, challenge } = await createPkcePair();
  const state = createState();

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId(),
    redirect_uri: redirectUri(),
    scope: MCP_SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    // RFC 8707: binds the token to the MCP server it is meant for.
    resource: MCP_ENDPOINT,
  });

  const response = NextResponse.redirect(
    `${OAUTH_AUTHORIZE_URL}?${params}`,
    302,
  );

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  };

  response.cookies.set("mcp_pkce_verifier", verifier, cookieOptions);
  response.cookies.set("mcp_oauth_state", state, cookieOptions);

  return response;
}
