"use client";

/**
 * Live listings from Binance's public B402 Bazaar.
 *
 * These are other people's paid endpoints, fetched at runtime with no API key.
 * Worth surfacing prominently: it is the one part of the demo where the agent
 * discovers services it did not already know about, which is what makes this a
 * network rather than a hardcoded pipeline.
 */

import { Radar } from "lucide-react";
import type { BazaarSample } from "@/hooks/useOrchestration";
import { Badge } from "./ui/Badge";
import { cn, formatUsd } from "@/lib/utils";

/** Strips the scheme and trailing slash so hosts read cleanly in a tight column. */
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function BazaarPanel({
  bazaar,
  className,
}: {
  bazaar: { count: number; sample: BazaarSample[] } | null;
  className?: string;
}) {
  if (!bazaar) {
    return (
      <div
        className={cn(
          "flex h-full min-h-32 flex-col items-center justify-center gap-2 px-5 py-8 text-center",
          className,
        )}
      >
        <Radar aria-hidden className="size-4 text-[var(--subtle)]" />
        <p className="text-[12px] text-[var(--subtle)]">
          Discovery runs before the first payment.
        </p>
      </div>
    );
  }

  if (bazaar.sample.length === 0) {
    return (
      <div className={cn("px-5 py-4", className)}>
        <p className="text-[12px] leading-relaxed text-[var(--muted)]">
          The Bazaar returned no matching listings for this query. Discovery is
          additive here — the mesh still runs against its own agents.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("px-5 py-4", className)}>
      <p className="text-[11px] leading-relaxed text-[var(--muted)]">
        <span className="numeric font-semibold text-[var(--foreground)]">
          {bazaar.count}
        </span>{" "}
        third-party endpoints on Binance B402 Bazaar accept x402 payment for this
        query. Any of them is callable by the same signing path used below.
      </p>

      <ul className="mt-3 space-y-2">
        {bazaar.sample.map((listing) => (
          <li
            key={listing.resource}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="numeric min-w-0 flex-1 truncate text-[11px] font-medium text-[var(--foreground)]">
                {displayUrl(listing.resource)}
              </p>
              {listing.priceUsd !== undefined ? (
                <Badge tone="brand" mono>
                  {formatUsd(listing.priceUsd)}
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--muted)]">
              {listing.description}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
