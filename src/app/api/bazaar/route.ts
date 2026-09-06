/**
 * GET /api/bazaar?query=...
 *
 * Proxies Binance's public B402 Bazaar discovery API. Server-side so the browser
 * avoids a cross-origin call, and so a Bazaar outage degrades to an empty list
 * instead of a console error.
 */

import { NextResponse } from "next/server";
import { listBazaar, listingPriceUsd, searchBazaar } from "@/lib/agents/bazaar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = params.get("query")?.trim();

  const resources = query
    ? await searchBazaar(query, { limit: 10 })
    : await listBazaar(12);

  return NextResponse.json({
    source: "binance-b402-bazaar",
    query: query ?? null,
    count: resources.length,
    resources: resources.map((resource) => ({
      resource: resource.resource,
      type: resource.type,
      description: resource.description,
      priceUsd: listingPriceUsd(resource),
      network: resource.accepts?.[0]?.network,
      asset: resource.accepts?.[0]?.asset,
      calls30d: resource.quality?.l30DaysTotalCalls,
      uniquePayers30d: resource.quality?.l30DaysUniquePayers,
    })),
  });
}
