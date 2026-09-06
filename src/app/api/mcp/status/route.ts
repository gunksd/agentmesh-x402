/**
 * GET /api/mcp/status
 *
 * Reports whether the MCP connection is authorised and, if so, which tools the
 * granted scopes expose.
 *
 * This exists because Binance does not publish the tool names anywhere — the
 * docs describe capability groups (market data, account, trade, transfer) but no
 * function signatures. The only way to learn them is `tools/list` against a live
 * authorised session, so this route doubles as the discovery step for wiring the
 * agents up.
 */

import { NextResponse } from "next/server";
import { MCP_ENDPOINT, MCP_SCOPES, clientId, mcpConfigured } from "@/lib/mcp/config";
import { listTools } from "@/lib/mcp/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const base = {
    endpoint: MCP_ENDPOINT,
    clientId: clientId(),
    requestedScopes: MCP_SCOPES,
  };

  if (!mcpConfigured()) {
    return NextResponse.json({
      ...base,
      connected: false,
      reason: "MCP_REFRESH_TOKEN is not set",
      connectUrl: "/api/mcp/connect",
    });
  }

  try {
    const tools = await listTools();
    return NextResponse.json({
      ...base,
      connected: true,
      toolCount: tools.length,
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        // Parameter names are the useful part when wiring a call site.
        parameters: tool.inputSchema?.properties
          ? Object.keys(tool.inputSchema.properties as object)
          : undefined,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ...base,
        connected: false,
        reason: error instanceof Error ? error.message : "unknown error",
        connectUrl: "/api/mcp/connect",
      },
      { status: 502 },
    );
  }
}
