/**
 * MCP client for Binance Agent OS, over streamable HTTP.
 *
 * Written directly against the protocol rather than pulling in the official SDK:
 * this project needs `initialize`, `tools/list` and `tools/call` and nothing
 * else, and hand-rolling those keeps the transport visible — which matters when
 * the interesting failure mode is a 401 from an expired token.
 *
 * Streamable HTTP means a POST can come back as either JSON or an SSE stream,
 * depending on the server. Both are handled.
 */

import { MCP_ENDPOINT } from "./config";
import { McpAuthError, accessToken, invalidateToken } from "./tokens";

const PROTOCOL_VERSION = "2025-06-18";
const REQUEST_TIMEOUT_MS = 20_000;

interface JsonRpcResponse<T> {
  jsonrpc: "2.0";
  id: number | string;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

export class McpError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
    this.name = "McpError";
  }
}

/** Session state, kept per process. Reinitialised on demand. */
let sessionId: string | null = null;
let initialised: Promise<void> | null = null;
let requestId = 0;

/**
 * Extracts the JSON-RPC payload from a streamable HTTP response.
 *
 * The server may answer with `application/json` or with an SSE stream carrying
 * one `data:` frame per message; we take the first frame that parses as a
 * response to our request.
 */
async function readPayload<T>(response: Response): Promise<JsonRpcResponse<T>> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await response.json()) as JsonRpcResponse<T>;
  }

  if (contentType.includes("text/event-stream")) {
    const text = await response.text();
    for (const block of text.split("\n\n")) {
      const dataLine = block
        .split("\n")
        .find((line) => line.startsWith("data:"));
      if (!dataLine) continue;

      try {
        const parsed = JSON.parse(dataLine.slice(5).trim());
        // Notifications have no id; skip them and keep looking for the reply.
        if (parsed && parsed.id !== undefined) {
          return parsed as JsonRpcResponse<T>;
        }
      } catch {
        // Malformed frame — try the next one.
      }
    }
    throw new McpError("No JSON-RPC response found in SSE stream");
  }

  throw new McpError(`Unexpected MCP content-type: ${contentType || "none"}`);
}

/** Sends one JSON-RPC request, retrying once if the access token was stale. */
async function send<T>(
  method: string,
  params: Record<string, unknown> = {},
  retryOnAuthFailure = true,
): Promise<T> {
  const token = await accessToken();
  requestId += 1;

  const headers: Record<string, string> = {
    "content-type": "application/json",
    // Advertise both so the server may stream or answer inline.
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${token}`,
    "mcp-protocol-version": PROTOCOL_VERSION,
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;

  const response = await fetch(MCP_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: requestId,
      method,
      params,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });

  // A stale token invalidates the session too, so reset both and retry once.
  if (response.status === 401 && retryOnAuthFailure) {
    invalidateToken();
    sessionId = null;
    initialised = null;
    await ensureInitialised();
    return send<T>(method, params, false);
  }

  if (response.status === 401) {
    throw new McpAuthError(
      "MCP rejected the access token — re-authorise at /api/mcp/connect.",
    );
  }

  if (!response.ok) {
    throw new McpError(`MCP ${method} returned ${response.status}`);
  }

  const captured = response.headers.get("mcp-session-id");
  if (captured) sessionId = captured;

  const payload = await readPayload<T>(response);
  if (payload.error) {
    throw new McpError(payload.error.message, payload.error.code);
  }
  if (payload.result === undefined) {
    throw new McpError(`MCP ${method} returned no result`);
  }

  return payload.result;
}

/** Performs the handshake once per process. */
async function ensureInitialised(): Promise<void> {
  if (initialised) return initialised;

  initialised = (async () => {
    await send<unknown>(
      "initialize",
      {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "AgentMesh", version: "0.1.0" },
      },
      false,
    );

    // The spec requires this notification before issuing further requests.
    const token = await accessToken();
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
      "mcp-protocol-version": PROTOCOL_VERSION,
    };
    if (sessionId) headers["mcp-session-id"] = sessionId;

    await fetch(MCP_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }).catch(() => {
      // Non-fatal: some servers accept requests without the notification.
    });
  })().catch((error) => {
    initialised = null;
    throw error;
  });

  return initialised;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/** Lists the tools this connection's scopes expose. */
export async function listTools(): Promise<McpTool[]> {
  await ensureInitialised();
  const result = await send<{ tools?: McpTool[] }>("tools/list");
  return result.tools ?? [];
}

interface ToolResult {
  content?: { type: string; text?: string }[];
  structuredContent?: unknown;
  isError?: boolean;
}

/**
 * Calls a tool and returns its payload.
 *
 * MCP tools answer with content blocks rather than typed values, so a text block
 * carrying JSON is parsed when possible and returned raw otherwise.
 */
export async function callTool<T = unknown>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  await ensureInitialised();

  const result = await send<ToolResult>("tools/call", {
    name,
    arguments: args,
  });

  if (result.isError) {
    const message =
      result.content?.map((block) => block.text).filter(Boolean).join(" ") ??
      "tool reported an error";
    throw new McpError(`MCP tool ${name} failed: ${message}`);
  }

  if (result.structuredContent !== undefined) {
    return result.structuredContent as T;
  }

  const text = result.content?.find((block) => block.type === "text")?.text;
  if (text === undefined) {
    throw new McpError(`MCP tool ${name} returned no readable content`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

/** Drops session state. Exposed for diagnostics. */
export function resetSession(): void {
  sessionId = null;
  initialised = null;
}
