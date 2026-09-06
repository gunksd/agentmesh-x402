/**
 * viem clients for the active chain.
 *
 * The wallet client is the relayer that sponsors gas on settle — the same role
 * B402's facilitator plays. It is only constructed on demand so that read-only
 * routes work without a relayer key present.
 */

import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ACTIVE_CHAIN_ID, ACTIVE_RPC_URL, EXPLORER_URLS } from "@/lib/chain";

export const activeChain = defineChain({
  id: ACTIVE_CHAIN_ID,
  name: ACTIVE_CHAIN_ID === 56 ? "BNB Smart Chain" : "BSC Testnet",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: { default: { http: [ACTIVE_RPC_URL] } },
  blockExplorers: {
    default: { name: "BscScan", url: EXPLORER_URLS[ACTIVE_CHAIN_ID] },
  },
});

export const publicClient = createPublicClient({
  chain: activeChain,
  transport: http(ACTIVE_RPC_URL),
});

export function relayerAccount() {
  const key = process.env.RELAYER_PRIVATE_KEY;
  if (!key) {
    throw new Error(
      "RELAYER_PRIVATE_KEY is not set — the facilitator cannot sponsor gas.",
    );
  }
  return privateKeyToAccount(key as `0x${string}`);
}

export function relayerClient() {
  return createWalletClient({
    account: relayerAccount(),
    chain: activeChain,
    transport: http(ACTIVE_RPC_URL),
  });
}
