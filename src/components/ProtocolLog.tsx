"use client";

/**
 * Raw protocol log.
 *
 * Every SSE event, in order, rendered as a terminal-style feed. This is the panel
 * that makes the demo credible: a viewer can read the 402 → sign → verify →
 * settle sequence happening per agent rather than taking the graph's word for it.
 */

import { useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import type { OrchestrationEvent } from "@/lib/agents/events";
import { useLanguage } from "./LanguageProvider";
import { AGENT_COPY, pick } from "@/lib/i18n/content";
import type { Lang } from "@/lib/i18n/types";
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
function describe(event: OrchestrationEvent, lang: Lang): LogLine | null {
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
        detail: `${pick(AGENT_COPY[event.skill].name, lang)} → ${event.amount} ${event.asset} to ${shortAddress(event.payTo)}`,
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
        detail: `${pick(AGENT_COPY[event.skill].name, lang)} responded · ${formatDuration(event.elapsedMs)} end to end`,
      };

    case "agent:failed":
      return {
        tone: "danger",
        label: "payment.failed",
        detail: `${pick(AGENT_COPY[event.skill].name, lang)} · ${event.reason}`,
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
  const { t, lang } = useLanguage();
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [hovered, setHovered] = useState(false);
  const [scrollable, setScrollable] = useState(false);
  const [atBottom, setAtBottom] = useState(true);

  /**
   * Auto-follow the tail, but stop while the pointer is over the log.
   *
   * Without this the panel yanks itself back to the bottom mid-read, which is the
   * behaviour that felt broken: the list scrolls out from under the cursor with no
   * indication that it is doing so deliberately.
   */
  useEffect(() => {
    if (hovered) return;
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [events.length, hovered]);

  /** Track whether there is anything to scroll, and whether we are at the end. */
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const measure = () => {
      const overflowing = element.scrollHeight > element.clientHeight + 4;
      setScrollable(overflowing);
      setAtBottom(
        element.scrollHeight - element.scrollTop - element.clientHeight < 24,
      );
    };

    measure();
    element.addEventListener("scroll", measure, { passive: true });

    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => {
      element.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [events.length]);

  if (events.length === 0) {
    return (
      <div
        className={cn(
          "flex min-h-40 flex-1 items-center justify-center px-5 py-8",
          "text-[12px] text-[var(--subtle)]",
          className,
        )}
      >
        {t("panelLogIdle")}
      </div>
    );
  }

  return (
    // Wrapper is relative so the hover affordances can be positioned over the
    // scroll area without joining its scroll flow.
    <div
      className={cn("relative min-h-0 flex-1", className)}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {/*
        Fills the card instead of capping at a fixed height. The card sits in a
        grid row alongside the taller Agents card, so a max-height here left dead
        space below the scroll area — min-h-0 lets this flex child actually shrink
        so overflow-y-auto scrolls the full available region.
      */}
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto overscroll-contain px-5 py-4"
        role="log"
        aria-live="polite"
        tabIndex={0}
      >
        <ol className="space-y-1.5">
        {events.map((event, index) => {
          const line = describe(event, lang);
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

      {/* Fade at the top edge, so clipped lines read as scrollable rather than cut. */}
      {scrollable ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-[var(--surface-raised)] to-transparent"
        />
      ) : null}

      {/*
        Hovering pauses auto-follow, so say so. Without this the list either yanks
        itself back to the bottom under the cursor, or silently stops following and
        looks frozen — both read as broken.
      */}
      {scrollable && hovered ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--surface-raised)]/95 px-5 py-1.5 backdrop-blur-sm">
          <span className="text-[10px] text-[var(--subtle)]">
            {t("logPaused")}
          </span>
          {!atBottom ? (
            <button
              type="button"
              onClick={() =>
                endRef.current?.scrollIntoView({
                  block: "end",
                  behavior: "smooth",
                })
              }
              className="pointer-events-auto inline-flex items-center gap-1 rounded-md border border-[var(--border-strong)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
            >
              <ArrowDown aria-hidden className="size-2.5" />
              {t("logJumpLatest")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
