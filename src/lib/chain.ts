/**
 * Chain + contract configuration.
 *
 * AgentMesh runs on BNB Smart Chain, matching Binance B402's deployment target.
 * Testnet (97) is the default so the demo needs no real funds; flipping
 * NEXT_PUBLIC_CHAIN_ID to 56 switches every address to mainnet.
 */

export const CHAIN_IDS = { mainnet: 56, testnet: 97 } as const;

export const ACTIVE_CHAIN_ID = Number(
  process.env.NEXT_PUBLIC_CHAIN_ID ?? CHAIN_IDS.testnet,
);

export const IS_MAINNET = ACTIVE_CHAIN_ID === CHAIN_IDS.mainnet;

/** CAIP-2 identifier, the format B402 uses in `paymentRequirements.network`. */
export const CAIP2_NETWORK = `eip155:${ACTIVE_CHAIN_ID}` as const;

/**
 * Uniswap's canonical Permit2 deployment. Same address on every EVM chain;
 * verified to have bytecode on BSC testnet.
 */
export const PERMIT2_ADDRESS =
  "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;

export const RPC_URLS: Record<number, string> = {
  [CHAIN_IDS.mainnet]:
    process.env.BSC_MAINNET_RPC ?? "https://bsc-dataseed.bnbchain.org",
  [CHAIN_IDS.testnet]:
    process.env.BSC_TESTNET_RPC ??
    "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
};

export const ACTIVE_RPC_URL = RPC_URLS[ACTIVE_CHAIN_ID];

export const EXPLORER_URLS: Record<number, string> = {
  [CHAIN_IDS.mainnet]: "https://bscscan.com",
  [CHAIN_IDS.testnet]: "https://testnet.bscscan.com",
};

export function txUrl(hash: string): string {
  return `${EXPLORER_URLS[ACTIVE_CHAIN_ID]}/tx/${hash}`;
}

export function addressUrl(address: string): string {
  return `${EXPLORER_URLS[ACTIVE_CHAIN_ID]}/address/${address}`;
}

export interface TokenConfig {
  symbol: string;
  address: `0x${string}`;
  decimals: number;
}

/**
 * Settlement tokens.
 *
 * Mainnet addresses are the B402-supported set from Binance's docs. On testnet
 * we deploy our own mintable stand-in so reviewers can fund themselves without
 * chasing a faucet — set MOCK_USDC_ADDRESS after running scripts/deploy-token.
 */
const MAINNET_USDC =
  "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d" as `0x${string}`;

export const SETTLEMENT_TOKEN: TokenConfig = IS_MAINNET
  ? { symbol: "USDC", address: MAINNET_USDC, decimals: 18 }
  : {
      symbol: "mUSDC",
      address: (process.env.NEXT_PUBLIC_MOCK_USDC_ADDRESS ??
        "0x0000000000000000000000000000000000000000") as `0x${string}`,
      decimals: 6,
    };

/** Where agent revenue lands. Falls back to the relayer for local runs. */
export const PAY_TO_ADDRESS = (process.env.NEXT_PUBLIC_PAY_TO_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;
