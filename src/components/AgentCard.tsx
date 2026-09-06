"use client";

/**
 * One agent's row: what it does, what it charged, and the on-chain receipt.
 *
 * The transaction hash links to BscScan, which is the point of the whole demo —
 * the payment is verifiable by anyone, not asserted by the UI.
 */

import { ExternalLink } from "lucide-react";
import { AGENTS, type AgentSkill } from "@/lib/agents/registry";
import type { AgentState } from "@/hooks/useOrchestration";
import { AgentStatusPill } from "./AgentStatusPill";
import { Badge } from "./ui/Badge";
import { cn, formatDuration, formatUsd, shortHash } from "@/lib/utils";

const ACCENT_CLASSES: Record<AgentSkill, string> = {
  "market-data": "bg-[var(--accent-market)]",
  "orderbook-depth": "bg-[var(--accent-depth)]",
  sentiment: "bg-[var(--accent-sentiment)]",
  risk: "bg-[var(--accent-risk)]",
  report: "bg-[var(--accent-report)]",
};

export function AgentCard({ state }: { state: AgentState }) {
  const agent = AGENTS[state.skill];
  const active = state.status !== "idle";

  return (
    <div
      className={cn(
        "relative flex gap-3 rounded-xl border px-4 py-3 transition-colors duration-200",
        active
          ? "border-[var(--border-strong)] bg-[var(--surface-raised)]"
          : "border-[var(--border)] bg-[var(--surface)]",
      )}
    >
      {/* Accent rail, tying the row to its node in the graph. */}
      <span
        aria-hidden
        className={cn(
          "mt-0.5 w-0.5 shrink-0 rounded-full",
          ACCENT_CLASSES[state.skill],
          active ? "opacity-100" : "opacity-30",
        )}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[13px] font-semibold tracking-tight">
              {agent.name}
            </h3>
            {agent.readsLiveMarket ? (
              <Badge tone="brand">Live data</Badge>
            ) : null}
          </div>
          <AgentStatusPill status={state.status} />
        </div>

        <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted)]">
          {agent.description}
        </p>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
          <span className="numeric font-semibold text-[var(--foreground)]">
            {formatUsd(agent.priceUsd)}
          </span>

          {state.signMs !== undefined ? (
            <span className="text-[var(--subtle)]">
              signed in{" "}
              <span className="numeric text-[var(--muted)]">
                {formatDuration(state.signMs)}
              </span>
            </span>
          ) : null}

          {state.settleMs !== undefined ? (
            <span className="text-[var(--subtle)]">
              settled in{" "}
              <span className="numeric text-[var(--muted)]">
                {formatDuration(state.settleMs)}
              </span>
            </span>
          ) : null}

          {state.explorerUrl && state.transaction ? (
            <a
              href={state.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "numeric inline-flex items-center gap-1 rounded-md px-1.5 py-0.5",
                "bg-[var(--success-soft)] text-[var(--success)]",
                "transition-opacity hover:opacity-75",
              )}
            >
              {shortHash(state.transaction)}
              <ExternalLink aria-hidden className="size-3" />
              <span className="sr-only">View settlement on BscScan</span>
            </a>
          ) : null}

          {state.failureReason ? (
            <span className="numeric text-[var(--danger)]">
              {state.failureReason}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
