"use client";

/**
 * Consumes the orchestrator's SSE stream and reduces it into render-ready state.
 *
 * One agent's lifecycle is a small state machine — idle → quoted → signed →
 * settling → delivered, or failed — and the UI reads that status directly rather
 * than inferring it from a pile of booleans.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { OrchestrationEvent } from "@/lib/agents/events";
import { AGENT_LIST, type AgentSkill } from "@/lib/agents/registry";

export type AgentStatus =
  | "idle"
  | "quoted"
  | "signed"
  | "settled"
  | "delivered"
  | "failed";

export interface AgentState {
  skill: AgentSkill;
  status: AgentStatus;
  /** Atomic units quoted in the 402 response. */
  amount?: string;
  payTo?: string;
  payer?: string;
  nonce?: string;
  transaction?: string;
  explorerUrl?: string;
  signMs?: number;
  settleMs?: number;
  totalMs?: number;
  data?: unknown;
  failureReason?: string;
}

export interface BazaarSample {
  resource: string;
  description: string;
  priceUsd?: number;
}

export interface RunState {
  runId?: string;
  symbol?: string;
  status: "idle" | "running" | "complete" | "error";
  agents: Record<AgentSkill, AgentState>;
  /** Ordered log of raw events, newest last. */
  log: OrchestrationEvent[];
  bazaar: { count: number; sample: BazaarSample[] } | null;
  totalSpentUsd: number;
  settledCount: number;
  elapsedMs?: number;
  error?: string;
}

function initialAgents(): Record<AgentSkill, AgentState> {
  return Object.fromEntries(
    AGENT_LIST.map((agent) => [agent.skill, { skill: agent.skill, status: "idle" }]),
  ) as Record<AgentSkill, AgentState>;
}

const INITIAL_STATE: RunState = {
  status: "idle",
  agents: initialAgents(),
  log: [],
  bazaar: null,
  totalSpentUsd: 0,
  settledCount: 0,
};

function reduce(state: RunState, event: OrchestrationEvent): RunState {
  const log = [...state.log, event];

  /** Merges a patch into one agent's slice. */
  const patch = (skill: AgentSkill, changes: Partial<AgentState>): RunState => ({
    ...state,
    log,
    agents: {
      ...state.agents,
      [skill]: { ...state.agents[skill], ...changes },
    },
  });

  switch (event.type) {
    case "run:start":
      return {
        ...INITIAL_STATE,
        agents: initialAgents(),
        runId: event.runId,
        symbol: event.symbol,
        status: "running",
        log,
      };

    case "bazaar:discovered":
      return {
        ...state,
        log,
        bazaar: { count: event.count, sample: event.sample },
      };

    case "agent:quoted":
      return patch(event.skill, {
        status: "quoted",
        amount: event.amount,
        payTo: event.payTo,
      });

    case "agent:signed":
      return patch(event.skill, {
        status: "signed",
        payer: event.payer,
        nonce: event.nonce,
        signMs: event.elapsedMs,
      });

    case "agent:settled":
      return patch(event.skill, {
        status: "settled",
        transaction: event.transaction,
        explorerUrl: event.explorerUrl,
        settleMs: event.elapsedMs,
      });

    case "agent:delivered":
      return patch(event.skill, {
        status: "delivered",
        data: event.data,
        totalMs: event.elapsedMs,
      });

    case "agent:failed":
      return patch(event.skill, {
        status: "failed",
        failureReason: event.reason,
      });

    case "run:complete":
      return {
        ...state,
        log,
        status: "complete",
        totalSpentUsd: event.totalSpentUsd,
        settledCount: event.settledCount,
        elapsedMs: event.elapsedMs,
      };

    case "run:error":
      return { ...state, log, status: "error", error: event.message };

    default:
      return { ...state, log };
  }
}

export function useOrchestration() {
  const [state, setState] = useState<RunState>(INITIAL_STATE);
  const sourceRef = useRef<EventSource | null>(null);

  const stop = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  const start = useCallback(
    (symbol: string, notionalUsd: number) => {
      stop();
      setState({ ...INITIAL_STATE, agents: initialAgents(), status: "running" });

      const params = new URLSearchParams({
        symbol,
        notional: String(notionalUsd),
      });
      const source = new EventSource(`/api/orchestrate?${params}`);
      sourceRef.current = source;

      source.onmessage = (message) => {
        let event: OrchestrationEvent;
        try {
          event = JSON.parse(message.data) as OrchestrationEvent;
        } catch {
          return;
        }

        setState((current) => reduce(current, event));

        // The server closes after run:complete; close our side too so the
        // browser does not attempt to reconnect.
        if (event.type === "run:complete" || event.type === "run:error") {
          source.close();
          sourceRef.current = null;
        }
      };

      source.onerror = () => {
        // EventSource fires this on normal close as well, so only surface it as
        // an error when the run had not finished.
        setState((current) =>
          current.status === "running"
            ? { ...current, status: "error", error: "Connection to orchestrator lost" }
            : current,
        );
        source.close();
        sourceRef.current = null;
      };
    },
    [stop],
  );

  useEffect(() => stop, [stop]);

  return { state, start, stop };
}
