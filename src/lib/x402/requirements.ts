/**
 * Builds the paymentRequirements a merchant returns in its 402 response.
 *
 * The `extra` block is what buyers depend on: they cannot call `/supported`
 * themselves, so the 402 body is their only source for the EIP-712 domain and
 * the Permit2 spender address. Binance's docs are explicit that `extra` must be
 * echoed verbatim from `/supported` — so under B402 we pass through their
 * values, and under the self-built facilitator we advertise our own relayer as
 * the spender (it is the address that calls Permit2, hence msg.sender).
 */

import { CAIP2_NETWORK, PAY_TO_ADDRESS, SETTLEMENT_TOKEN } from "@/lib/chain";
import { relayerAccount } from "./clients";
import { activeFacilitator } from "./facilitator";
import { priceToAtomic, type AgentDefinition } from "@/lib/agents/registry";
import type { PaymentRequirements } from "./types";

/** Seconds a buyer has to sign before requirements go stale. */
const MAX_TIMEOUT_SECONDS = 120;

/**
 * Resolves the Permit2 spender.
 *
 * Self-built: the relayer EOA, because Permit2 checks the signed spender
 * against msg.sender and the relayer is what submits the transaction.
 * B402: Binance's Permit2 proxy, read from their /supported response.
 */
function resolveSpender(): `0x${string}` {
  if (activeFacilitator() === "b402") {
    const proxy = process.env.B402_SPENDER_ADDRESS;
    if (!proxy) {
      throw new Error(
        "B402_SPENDER_ADDRESS is required — read extra.spenderAddress from /supported.",
      );
    }
    return proxy as `0x${string}`;
  }
  return relayerAccount().address;
}

export function buildRequirements(
  agent: AgentDefinition,
  resourceUrl: string,
): PaymentRequirements {
  return {
    scheme: "permit2-exact",
    network: CAIP2_NETWORK,
    amount: priceToAtomic(agent.priceUsd),
    asset: SETTLEMENT_TOKEN.address,
    payTo: PAY_TO_ADDRESS,
    resource: resourceUrl,
    description: agent.description,
    mimeType: "application/json",
    maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
    extra: {
      name: "Permit2",
      assetTransferMethod: "permit2-exact",
      spenderAddress: resolveSpender(),
    },
  };
}
