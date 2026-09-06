/**
 * Orchestration event stream.
 *
 * The orchestrator emits one event per protocol step so the UI can render the
 * payment flow as it happens rather than showing a spinner and a final result.
 * Each agent produces the same sequence: discovered → quoted → signed →
 * settled → delivered, or failed.
 */

import type { AgentSkill } from "./registry";

export type OrchestrationEvent =
  | { type: "run:start"; runId: string; symbol: string; plan: AgentSkill[] }
  | {
      type: "bazaar:discovered";
      /** Live listings from Binance's public B402 Bazaar. */
      count: number;
      sample: { resource: string; description: string; priceUsd?: number }[];
    }
  | { type: "agent:quoted"; skill: AgentSkill; amount: string; asset: string; payTo: string }
  | { type: "agent:signed"; skill: AgentSkill; payer: string; nonce: string; elapsedMs: number }
  | {
      type: "agent:settled";
      skill: AgentSkill;
      transaction?: string;
      explorerUrl?: string;
      elapsedMs: number;
    }
  | { type: "agent:delivered"; skill: AgentSkill; data: unknown; elapsedMs: number }
  | { type: "agent:failed"; skill: AgentSkill; reason: string }
  | {
      type: "run:complete";
      runId: string;
      totalSpentAtomic: string;
      totalSpentUsd: number;
      settledCount: number;
      elapsedMs: number;
    }
  | { type: "run:error"; message: string };

export type EventSink = (event: OrchestrationEvent) => void;

/** Encodes an event as an SSE frame. */
export function toSseFrame(event: OrchestrationEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
