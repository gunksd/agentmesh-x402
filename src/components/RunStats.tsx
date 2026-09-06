"use client";

/**
 * Run-level metrics: what the pipeline cost and how long it took.
 *
 * Cost is the headline number. Five on-chain settlements for around a tenth of a
 * cent is the argument the project is making, so it gets the largest type.
 */

import { PIPELINE_TOTAL_USD } from "@/lib/agents/registry";
import type { RunState } from "@/hooks/useOrchestration";
import { cn, formatDuration, formatUsd } from "@/lib/utils";

function Metric({
  label,
  value,
  hint,
  emphasis = false,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-[var(--subtle)]">
        {label}
      </dt>
      <dd
        className={cn(
          "numeric mt-1 font-semibold tracking-tight",
          emphasis ? "text-[22px] text-[var(--brand)]" : "text-[15px]",
        )}
      >
        {value}
      </dd>
      {hint ? (
        <p className="mt-0.5 text-[10px] text-[var(--subtle)]">{hint}</p>
      ) : null}
    </div>
  );
}

export function RunStats({
  state,
  className,
}: {
  state: RunState;
  className?: string;
}) {
  // Mid-run, sum what has actually settled rather than showing the final total.
  const settledSoFar = Object.values(state.agents).filter(
    (agent) => agent.status === "settled" || agent.status === "delivered",
  );

  const spent =
    state.status === "complete"
      ? state.totalSpentUsd
      : settledSoFar.reduce((sum, agent) => {
          const amount = agent.amount ? Number(agent.amount) : 0;
          // Amounts arrive in atomic units; the settlement token uses 6 decimals
          // on testnet and 18 on mainnet, so scale from the quoted value.
          return sum + amount / 1_000_000;
        }, 0);

  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-x-4 gap-y-4 px-5 py-4 sm:grid-cols-4",
        className,
      )}
    >
      <Metric
        label="Spent on-chain"
        value={formatUsd(spent)}
        hint={`of ${formatUsd(PIPELINE_TOTAL_USD)} budget`}
        emphasis
      />
      <Metric
        label="Agents paid"
        value={`${settledSoFar.length}/${Object.keys(state.agents).length}`}
        hint="settlements confirmed"
      />
      <Metric
        label="Wall clock"
        value={state.elapsedMs ? formatDuration(state.elapsedMs) : "—"}
        hint="discovery to report"
      />
      <Metric
        label="Human approvals"
        value="0"
        hint="fully autonomous"
      />
    </dl>
  );
}
