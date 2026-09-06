/**
 * What ships today, and what is built and waiting.
 *
 * Two integrations are written against Binance's documented contracts and gated
 * on access we expect to land: the B402 facilitator needs merchant onboarding,
 * and the MCP server currently admits a fixed set of clients. Both are presented
 * as roadmap rather than as gaps — the code exists, the switch is a config value.
 */

import { Badge, type BadgeTone } from "./ui/Badge";
import { Card, CardBody, CardHeader } from "./ui/Card";

type SurfaceStatus = "live" | "shipped" | "next";

/**
 * Three states. `shipped` marks code that runs today, `next` marks integrations
 * written and waiting on access, so a reader can tell which is which.
 */
const STATUS_LABELS: Record<SurfaceStatus, string> = {
  live: "Live",
  shipped: "Shipped",
  next: "Coming next",
};

const STATUS_TONES: Record<SurfaceStatus, BadgeTone> = {
  live: "success",
  shipped: "success",
  next: "brand",
};

const SURFACES: { name: string; status: SurfaceStatus; detail: string }[] = [
  {
    name: "B402 Bazaar discovery",
    status: "live" as const,
    detail:
      "Public catalog, queried at runtime on every run. No credentials needed.",
  },
  {
    name: "Cross-vendor payment",
    status: "live" as const,
    detail:
      "Our client reads and validates 402 challenges from third-party endpoints listed on the Bazaar — x402 v2 on BNB Smart Chain, decoded straight off their wire.",
  },
  {
    name: "Permit2 settlement",
    status: "live" as const,
    detail:
      "Real transfers on BNB Smart Chain via Uniswap's canonical Permit2 deployment, with the facilitator sponsoring gas.",
  },
  {
    name: "Binance market data",
    status: "live" as const,
    detail:
      "Spot tickers, order book depth and klines behind every paid agent response.",
  },
  {
    name: "Order preview",
    status: "shipped" as const,
    detail:
      "The report agent emits executable order parameters — side, limit inside the spread, volatility-scaled stop — marked awaiting_human_approval. The mesh sells the decision; you keep the trigger.",
  },
  {
    name: "Agent OS MCP server",
    status: "next" as const,
    detail:
      "OAuth 2.1 with PKCE and a hosted client_id metadata document, implemented end to end at /api/mcp/connect. Binance currently admits a fixed set of MCP clients; market reads switch over the moment self-hosted agents are eligible.",
  },
  {
    name: "B402 facilitator",
    status: "next" as const,
    detail:
      "verify/settle client written against Binance's spec including RSA-SHA256 request signing. Activates on merchant onboarding — one environment variable moves settlement from our facilitator to Binance's, and the paying agent never notices.",
  },
  {
    name: "Bazaar listing",
    status: "next" as const,
    detail:
      "Publishing our own five agents to the Bazaar so third parties can discover and pay them. Listing metadata attaches to a V2 settle, so it follows directly from facilitator access.",
  },
];

export function StackNote() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 pb-16 sm:pb-24">
      <Card>
        <CardHeader
          title="Shipped today, and what's coming next"
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
