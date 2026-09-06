/**
 * Deploys MeshUSD to BSC Testnet, funds the orchestrator, and approves Permit2.
 *
 *   node scripts/compile.mjs && node scripts/deploy.mjs
 *
 * The Permit2 approval at the end is the step that is easy to forget and hard to
 * debug: the facilitator's /verify does not check ERC-20 allowance, so an
 * unapproved payer passes verification and only fails at settle with
 * TRANSFER_FROM_FAILED. Doing it here means the demo cannot hit that.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  formatUnits,
  http,
  maxUint256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const RPC_URL =
  process.env.BSC_TESTNET_RPC ??
  "https://data-seed-prebsc-1-s1.bnbchain.org:8545";

/** Starting balance for the orchestrator: 1,000 mUSD at 6 decimals. */
const ORCHESTRATOR_FUNDING = 1_000_000_000n;

const bscTestnet = defineChain({
  id: 97,
  name: "BSC Testnet",
  nativeCurrency: { name: "BNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: {
    default: { name: "BscScan", url: "https://testnet.bscscan.com" },
  },
});

/** Reads .env.local without adding a dotenv dependency. */
function loadEnv() {
  const env = {};
  try {
    const contents = readFileSync(join(root, ".env.local"), "utf8");
    for (const line of contents.split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match) env[match[1]] = match[2].trim();
    }
  } catch {
    throw new Error("Could not read .env.local — run scripts/wallets.mjs first.");
  }
  return env;
}

function requireKey(env, name) {
  const value = env[name] ?? process.env[name];
  if (!value?.startsWith("0x")) {
    throw new Error(`${name} is missing from .env.local`);
  }
  return value;
}

const env = loadEnv();
const relayerKey = requireKey(env, "RELAYER_PRIVATE_KEY");
const orchestratorKey = requireKey(env, "ORCHESTRATOR_PRIVATE_KEY");

const relayer = privateKeyToAccount(relayerKey);
const orchestrator = privateKeyToAccount(orchestratorKey);

const publicClient = createPublicClient({
  chain: bscTestnet,
  transport: http(RPC_URL),
});
const relayerWallet = createWalletClient({
  account: relayer,
  chain: bscTestnet,
  transport: http(RPC_URL),
});
const orchestratorWallet = createWalletClient({
  account: orchestrator,
  chain: bscTestnet,
  transport: http(RPC_URL),
});

const artifact = JSON.parse(
  readFileSync(join(root, "build", "MeshUSD.json"), "utf8"),
);

console.log(`Relayer      ${relayer.address}`);
console.log(`Orchestrator ${orchestrator.address}`);

const gasBalance = await publicClient.getBalance({ address: relayer.address });
console.log(`Relayer gas  ${formatEther(gasBalance)} tBNB\n`);

if (gasBalance === 0n) {
  console.error(
    "Relayer has no tBNB. Fund it before deploying:\n" +
      `  https://www.bnbchain.org/en/testnet-faucet  →  ${relayer.address}`,
  );
  process.exit(1);
}

// 1. Deploy the settlement token.
console.log("Deploying MeshUSD...");
const deployHash = await relayerWallet.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode,
});
const deployReceipt = await publicClient.waitForTransactionReceipt({
  hash: deployHash,
  timeout: 120_000,
});

const token = deployReceipt.contractAddress;
if (!token) throw new Error("Deployment produced no contract address");
console.log(`  ${token}`);
console.log(`  https://testnet.bscscan.com/tx/${deployHash}\n`);

// 2. Mint the orchestrator a working balance so it can pay agents.
console.log("Funding orchestrator...");
const mintHash = await relayerWallet.writeContract({
  address: token,
  abi: artifact.abi,
  functionName: "mint",
  args: [orchestrator.address, ORCHESTRATOR_FUNDING],
});
await publicClient.waitForTransactionReceipt({ hash: mintHash, timeout: 120_000 });

const balance = await publicClient.readContract({
  address: token,
  abi: artifact.abi,
  functionName: "balanceOf",
  args: [orchestrator.address],
});
console.log(`  ${formatUnits(balance, 6)} mUSD\n`);

// 3. Approve Permit2 once, so every later payment is signature-only.
console.log("Approving Permit2...");

const gasForApproval = await publicClient.getBalance({
  address: orchestrator.address,
});

if (gasForApproval === 0n) {
  // The orchestrator needs gas exactly once, for this approval. Every payment
  // after this is gasless from its side.
  console.log("  Orchestrator has no tBNB — sending it some for the approval.");
  const fundHash = await relayerWallet.sendTransaction({
    to: orchestrator.address,
    value: 2_000_000_000_000_000n, // 0.002 tBNB
  });
  await publicClient.waitForTransactionReceipt({ hash: fundHash, timeout: 120_000 });
}

const approveHash = await orchestratorWallet.writeContract({
  address: token,
  abi: artifact.abi,
  functionName: "approve",
  args: [PERMIT2, maxUint256],
});
await publicClient.waitForTransactionReceipt({ hash: approveHash, timeout: 120_000 });

const allowance = await publicClient.readContract({
  address: token,
  abi: artifact.abi,
  functionName: "allowance",
  args: [orchestrator.address, PERMIT2],
});
console.log(`  allowance ${allowance === maxUint256 ? "unlimited" : allowance}\n`);

console.log("Add this to .env.local:");
console.log(`NEXT_PUBLIC_MOCK_USDC_ADDRESS=${token}`);
