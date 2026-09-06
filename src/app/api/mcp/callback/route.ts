/**
 * GET /api/mcp/callback
 *
 * Completes the MCP authorisation flow: validates state, exchanges the code for
 * tokens using the stored PKCE verifier, and shows the refresh token once so it
 * can be saved as an environment variable.
 *
 * Deliberately does not persist the token server-side. This project has no
 * datastore, and writing a long-lived credential to disk in a serverless
 * function would be worse than showing it to the operator who just authorised
 * it. Paste it into MCP_REFRESH_TOKEN and redeploy.
 */

import { NextResponse } from "next/server";
import {
  MCP_ENDPOINT,
  OAUTH_TOKEN_URL,
  clientId,
  redirectUri,
} from "@/lib/mcp/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

/** Minimal HTML page. Renders the token for a one-time copy, then it is gone. */
function page(title: string, body: string, status: number): NextResponse {
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{font:14px/1.6 ui-sans-serif,system-ui,sans-serif;color:#0a1628;
       background:#f6f9fe;margin:0;padding:48px 24px;display:flex;
       justify-content:center}
  main{max-width:640px;width:100%;background:#fff;border:1px solid #e3eaf5;
       border-radius:16px;padding:28px}
  h1{font-size:18px;margin:0 0 12px}
  code{font:12px/1.5 ui-monospace,monospace;background:#f6f9fe;
       border:1px solid #e3eaf5;border-radius:8px;padding:10px 12px;
       display:block;overflow-wrap:anywhere;margin:8px 0 16px}
  a{color:#0b63f6}
  .warn{color:#b7791f}
</style></head><body><main>${body}</main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return page(
      "Authorisation declined",
      `<h1>Authorisation declined</h1><p>Binance returned <code>${error}</code>${
        url.searchParams.get("error_description")
          ? `<br>${url.searchParams.get("error_description")}`
          : ""
      }</p><p><a href="/api/mcp/connect">Try again</a></p>`,
      400,
    );
  }

  const cookies = request.headers.get("cookie") ?? "";
  const read = (name: string) =>
    cookies
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1);

  const verifier = read("mcp_pkce_verifier");
  const expectedState = read("mcp_oauth_state");

  if (!code || !verifier) {
    return page(
      "Incomplete flow",
      `<h1>Incomplete flow</h1><p>Missing authorisation code or PKCE verifier.
       The flow may have expired.</p>
       <p><a href="/api/mcp/connect">Start over</a></p>`,
      400,
    );
  }

  // State mismatch means this callback did not originate from our redirect.
  if (!expectedState || returnedState !== expectedState) {
    return page(
      "State mismatch",
      `<h1>State mismatch</h1><p>The <code>state</code> parameter did not match
       the value issued when the flow started, so this callback was rejected.</p>`,
      400,
    );
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    client_id: clientId(),
    code_verifier: verifier,
    resource: MCP_ENDPOINT,
  });

  let tokens: TokenResponse;
  try {
    const response = await fetch(OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    tokens = (await response.json()) as TokenResponse;
  } catch (cause) {
    return page(
      "Token exchange failed",
      `<h1>Token exchange failed</h1><p>${
        cause instanceof Error ? cause.message : "Network error"
      }</p>`,
      502,
    );
  }

  if (tokens.error || !tokens.refresh_token) {
    return page(
      "Token exchange rejected",
      `<h1>Token exchange rejected</h1>
       <p>${tokens.error ?? "No refresh token returned"}${
         tokens.error_description ? `: ${tokens.error_description}` : ""
       }</p>`,
      400,
    );
  }

  const response = page(
    "MCP connected",
    `<h1>MCP connected</h1>
     <p>Granted scopes: <code>${tokens.scope ?? "(not reported)"}</code></p>
     <p>Save this as <code>MCP_REFRESH_TOKEN</code> and redeploy. It is shown
        once and not stored anywhere.</p>
     <code>${tokens.refresh_token}</code>
     <p class="warn">Treat this like a password — it grants read access to your
        Agentic sub-account.</p>
     <p><a href="/">Back to AgentMesh</a></p>`,
    200,
  );

  // The verifier and state are single-use; clear them either way.
  response.cookies.delete("mcp_pkce_verifier");
  response.cookies.delete("mcp_oauth_state");

  return response;
}
