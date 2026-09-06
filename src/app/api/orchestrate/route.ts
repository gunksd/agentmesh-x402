/**
 * GET /api/orchestrate?symbol=BTCUSDT
 *
 * Runs the paid pipeline and streams protocol events over SSE, so the UI shows
 * each quote, signature and settlement as it happens instead of waiting for the
 * whole run.
 *
 * The paying key lives only here, server-side. The browser never holds it.
 */

import { runPipeline } from "@/lib/agents/orchestrator";
import { toSseFrame, type OrchestrationEvent } from "@/lib/agents/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Five settlements plus block confirmations need headroom. */
export const maxDuration = 120;

const MIN_NOTIONAL = 100;
const MAX_NOTIONAL = 100_000_000;

/** Absolute origin of this deployment, needed for server-to-server agent calls. */
function resolveBaseUrl(request: Request): string {
  if (process.env.AGENTMESH_BASE_URL) {
    return process.env.AGENTMESH_BASE_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const symbol = params.get("symbol")?.toUpperCase() ?? "BTCUSDT";

  const parsedNotional = Number(params.get("notional"));
  const notionalUsd = Number.isFinite(parsedNotional)
    ? Math.min(MAX_NOTIONAL, Math.max(MIN_NOTIONAL, parsedNotional))
    : 10_000;

  const privateKey = process.env.ORCHESTRATOR_PRIVATE_KEY as
    | `0x${string}`
    | undefined;

  const encoder = new TextEncoder();

  if (!privateKey) {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            toSseFrame({
              type: "run:error",
              message:
                "ORCHESTRATOR_PRIVATE_KEY is not set — the orchestrator has no wallet to pay from.",
            }),
          ),
        );
        controller.close();
      },
    });

    return new Response(stream, { status: 200, headers: sseHeaders() });
  }

  const baseUrl = resolveBaseUrl(request);

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const emit = (event: OrchestrationEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(toSseFrame(event)));
        } catch {
          // Client disconnected mid-run; stop emitting but let the pipeline
          // finish so in-flight settlements are not abandoned.
          closed = true;
        }
      };

      try {
        await runPipeline({ symbol, notionalUsd, baseUrl, privateKey, emit });
      } catch (error) {
        emit({
          type: "run:error",
          message:
            error instanceof Error ? error.message : "orchestration_failed",
        });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed by the client.
        }
      }
    },
  });

  return new Response(stream, { status: 200, headers: sseHeaders() });
}

function sseHeaders(): HeadersInit {
  return {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    // Disable proxy buffering so events arrive as they are produced.
    "x-accel-buffering": "no",
  };
}
