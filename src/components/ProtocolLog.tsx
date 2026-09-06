"use client";

/**
 * Raw protocol log.
 *
 * Every SSE event, in order, rendered as a terminal-style feed. This is the panel
 * that makes the demo credible: a viewer can read the 402 → sign → verify →
 * settle sequence happening per agent rather than taking the graph's word for it.
 */

import { useEffect, useRef } from "react";
import type { OrchestrationEvent } from "@/lib/agents/events";
import { AGENTS } from "@/lib/agents/registry";
import { cn, formatDuration, shortAddress, shortHash } from "@/lib/utils";

interface LogLine {
  tone: "brand" | "success" | "danger" | "muted" | "warning";
  label: string;
  detail: string;
}

const TONE_CLASSES: Record<LogLine["tone"], string> = {
  brand: "text-[var(--brand)]",
  success: "text-[var(--success)]",
  danger: "text-[var(--danger)]",
  warning: "text-[var(--warning)]",
  muted: "text-[var(--subtle)]",
};

/** Maps a protocol event to one readable line. */
function describe(event: OrchestrationEvent): LogLine | null {
  switch (event.type) {
    case "run:start":
      return {
        tone: "muted",
        label: "run.start",
        detail: `${event.symbol} · ${event.plan.length} agents queued`,
      };

    case "bazaar:discovered":
      return {
        tone: "brand",
        label: "bazaar.discover",
        detail: `${event.count} paid endpoints found on Binance B402 Bazaar`,
      };

    case "agent:quoted":
      return {
        tone: "warning",
        label: "402.quoted",
        detail: `${AGENTS[event.skill].name} → ${event.amount} ${event.asset} to ${shortAddress(event.payTo)}`,
      };

    case "agent:signed":
      return {
        tone: "brand",
        label: "eip712.signed",
        detail: `${shortAddress(event.payer)} authorised in ${formatDuration(event.elapsedMs)} · nonce ${event.nonce.slice(0, 10)}…`,
      };

    case "agent:settled":
      return {
        tone: "success",
        label: "permit2.settled",
        detail: event.transaction
          ? `${shortHash(event.transaction)} confirmed in ${formatDuration(event.elapsedMs)}`
          : `confirmed in ${formatDuration(event.elapsedMs)}`,
      };

    case "agent:delivered":
      return {
        tone: "muted",
        label: "resource.delivered",
        detail: `${AGENTS[event.skill].name} responded · ${formatDuration(event.elapsedMs)} end to end`,
      };

    case "agent:failed":
      return {
        tone: "danger",
        label: "payment.failed",
        detail: `${AGENTS[event.skill].name} · ${event.reason}`,
      };

    case "run:complete":
      return {
        tone: "success",
        label: "run.complete",
        detail: `${event.settledCount} agents paid · $${event.totalSpentUsd.toFixed(4)} in ${formatDuration(event.elapsedMs)}`,
      };

    case "run:error":
      return { tone: "danger", label: "run.error", detail: event.message };

    default:
      return null;
  }
}

export function ProtocolLog({
  events,
  className,
}: {
  events: OrchestrationEvent[];
  className?: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  // Follow the tail as events stream in.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [events.length]);

  if (events.length === 0) {
    return (
      <div
        className={cn(
          "flex h-full min-h-40 items-center justify-center px-5 py-8",
          "text-[12px] text-[var(--subtle)]",
          className,
        )}
      >
        Protocol events appear here once a run starts.
      </div>
    );
  }

  return (
    <div
      className={cn("max-h-[22rem] overflow-y-auto px-5 py-4", className)}
      role="log"
      aria-live="polite"
    >
      <ol className="space-y-1.5">
        {events.map((event, index) => {
          const line = describe(event);
          if (!line) return null;

          return (
            <li
              key={`${event.type}-${index}`}
              className="rise-in flex gap-2.5 text-[11px] leading-relaxed"
            >
              <span
                className={cn(
                  "numeric w-[8.5rem] shrink-0 font-medium",
                  TONE_CLASSES[line.tone],
                )}
              >
                {line.label}
              </span>
              <span className="numeric min-w-0 flex-1 text-[var(--muted)]">
                {line.detail}
              </span>
            </li>
          );
        })}
      </ol>
      <div ref={endRef} />
    </div>
  );
}
