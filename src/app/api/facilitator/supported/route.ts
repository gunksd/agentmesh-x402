/**
 * POST /api/facilitator/supported
 *
 * Advertises which payment kinds this facilitator accepts, matching B402's
 * `/papi/v2/b402/supported` response shape. Merchants cache this and echo the
 * `extra` block verbatim into their 402 responses.
 *
 * POST rather than GET because that is what B402 specifies; GET is also allowed
 * here so the config is inspectable from a browser.
 */

import { NextResponse } from "next/server";
import { CAIP2_NETWORK, PERMIT2_ADDRESS, SETTLEMENT_TOKEN } from "@/lib/chain";
import { relayerAccount } from "@/lib/x402/clients";
import { activeFacilitator, facilitatorLabel } from "@/lib/x402/facilitator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supportedConfiguration() {
  const mode = activeFacilitator();

  // Under the self-built facilitator the relayer EOA is the Permit2 spender,
  // because Permit2 checks the signed spender against msg.sender.
  const spenderAddress =
    mode === "b402"
      ? (process.env.B402_SPENDER_ADDRESS ?? "")
      : relayerAccount().address;

  return {
    x402Version: 2,
    facilitator: { mode, label: facilitatorLabel(mode) },
    kinds: [
      {
        scheme: "permit2-exact",
        network: CAIP2_NETWORK,
        asset: SETTLEMENT_TOKEN.address,
        assetSymbol: SETTLEMENT_TOKEN.symbol,
        assetDecimals: SETTLEMENT_TOKEN.decimals,
        extra: {
          name: "Permit2",
          assetTransferMethod: "permit2-exact",
          spenderAddress,
          verifyingContract: PERMIT2_ADDRESS,
        },
      },
    ],
    signers: [spenderAddress],
    gasSponsored: true,
  };
}

export async function POST() {
  try {
    return NextResponse.json(supportedConfiguration());
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "configuration_unavailable",
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return POST();
}
