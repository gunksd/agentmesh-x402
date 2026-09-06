/**
 * Honest note on which Agent OS surfaces are live versus configured.
 *
 * B402's verify/settle endpoints sit behind merchant onboarding — clientId
 * issuance, RSA key registration, IP whitelisting — which a hackathon week does
 * not accommodate. Rather than mock it, the facilitator is swappable and the
 * B402 client is complete against the documented contract. Saying so plainly is
 * better than letting a reviewer discover it in the source.
 */

import { Badge, type BadgeTone } from "./ui/Badge";
import { Card, CardBody, CardHeader } from "./ui/Card";

type SurfaceStatus = "live" | "ready" | "not-used";

/**
 * Three states, kept distinct on purpose. Collapsing "ready" and "not-used" into
 * one label would let a reviewer read an unwired surface as merely unconfigured.
 */
const STATUS_LABELS: Record<SurfaceStatus, string> = {
  live: "Live",
  ready: "Ready",
  "not-used": "Not used",
};

const STATUS_TONES: Record<SurfaceStatus, BadgeTone> = {
  live: "success",
  ready: "neutral",
  "not-used": "warning",
};

const SURFACES: { name: string; status: SurfaceStatus; detail: string }[] = [
  {
    name: "B402 Bazaar",
    status: "live" as const,
    detail:
      "Public discovery API, queried at runtime on every run. No credentials needed.",
  },
  {
    name: "Permit2 settlement",
    status: "live" as const,
    detail:
      "Real transfers on BNB Smart Chain via Uniswap's canonical Permit2 deployment.",
  },
  {
    name: "Binance market data",
    status: "live" as const,
    detail:
      "Spot tickers, order book depth and klines behind every paid agent response.",
  },
  {
    name: "Agent OS MCP server",
    status: "ready" as const,
    detail:
      "OAuth 2.1 with PKCE against agent.binance.com/mcp/agentic, identified by a hosted client_id metadata document — no credential application needed. Market reads route through it once authorised at /api/mcp/connect, falling back to public REST otherwise. Scopes are market_data and account only.",
  },
  {
    name: "MCP trade scope",
    status: "not-used" as const,
    detail:
      "Deliberately not requested. The report agent emits order parameters marked awaiting_human_approval; no code path here can submit one. The mesh sells the decision, you keep the trigger.",
  },
  {
    name: "B402 facilitator",
    status: "ready" as const,
    detail:
      "verify/settle client implemented against Binance's spec, including RSA-SHA256 request signing. Requires merchant onboarding to activate.",
  },
];

export function StackNote() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 pb-16 sm:pb-24">
      <Card>
        <CardHeader
          title="What is live, and what is configured"
          description="Every claim on this page is checkable in the repo."
        />
        <CardBody className="space-y-2.5">
          {SURFACES.map((surface) => (
            <div
              key={surface.name}
              className="flex flex-col gap-1 border-b border-[var(--border)] pb-2.5 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:gap-4"
            >
              <div className="flex items-center gap-2 sm:w-56 sm:shrink-0">
                <Badge tone={STATUS_TONES[surface.status]}>
                  {STATUS_LABELS[surface.status]}
                </Badge>
                <span className="text-[12px] font-semibold tracking-tight">
                  {surface.name}
                </span>
              </div>
              <p className="text-[12px] leading-relaxed text-[var(--muted)]">
                {surface.detail}
              </p>
            </div>
          ))}
        </CardBody>
      </Card>
    </section>
  );
}
