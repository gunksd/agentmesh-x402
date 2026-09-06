/**
 * Reproduces concurrent settlement against Permit2 and prints raw errors.
 *
 * The pipeline pays four agents in parallel and three of them failed while the
 * one serial payment succeeded. This isolates settlement from Next.js so the
 * underlying revert or RPC rejection is visible verbatim.
 *
 *   node scripts/diagnose-settle.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeAbiParameters,
  http,
  keccak256,
  parseAbiParameters,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const RPC = process.env.BSC_TESTNET_RPC ?? "https://data-seed-prebsc-1-s1.bnbchain.org:8545";

function loadEnv() {
  const env = {};
  for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnv();
const token = env.NEXT_PUBLIC_MOCK_USDC_ADDRESS;
const payTo = env.NEXT_PUBLIC_PAY_TO_ADDRESS;

const chain = defineChain({
  id: 97,
  name: "BSC Testnet",
  nativeCurrency: { name: "BNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

const relayer = privateKeyToAccount(env.RELAYER_PRIVATE_KEY);
const orchestrator = privateKeyToAccount(env.ORCHESTRATOR_PRIVATE_KEY);

const publicClient = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ account: relayer, chain, transport: http(RPC) });

const PERMIT2_ABI = [
  {
    name: "permitWitnessTransferFrom",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "permit", type: "tuple",
        components: [
          { name: "permitted", type: "tuple", components: [
            { name: "token", type: "address" }, { name: "amount", type: "uint256" },
          ]},
          { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
        ],
      },
      { name: "transferDetails", type: "tuple", components: [
        { name: "to", type: "address" }, { name: "requestedAmount", type: "uint256" },
      ]},
      { name: "owner", type: "address" },
      { name: "witness", type: "bytes32" },
      { name: "witnessTypeString", type: "string" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
];

const WITNESS_TYPE_STRING =
  "Witness witness)TokenPermissions(address token,uint256 amount)Witness(address to,uint256 validAfter)";

const TYPES = {
  PermitWitnessTransferFrom: [
    { name: "permitted", type: "TokenPermissions" },
    { name: "spender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "witness", type: "Witness" },
  ],
  TokenPermissions: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
  ],
  Witness: [
    { name: "to", type: "address" },
    { name: "validAfter", type: "uint256" },
  ],
};

const WITNESS_TYPEHASH = keccak256(
  new TextEncoder().encode("Witness(address to,uint256 validAfter)"),
);

function hashWitness(to, validAfter) {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32, address, uint256"), [
      WITNESS_TYPEHASH, to, BigInt(validAfter),
    ]),
  );
}

async function signAndSettle(label, amount) {
  const now = Math.floor(Date.now() / 1000);
  const nonce = BigInt(`0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}`);
  const deadline = BigInt(now + 3600);
  const validAfter = BigInt(now - 60);

  const signature = await orchestrator.signTypedData({
    domain: { name: "Permit2", chainId: 97, verifyingContract: PERMIT2 },
    types: TYPES,
    primaryType: "PermitWitnessTransferFrom",
    message: {
      permitted: { token, amount: BigInt(amount) },
      spender: relayer.address,
      nonce,
      deadline,
      witness: { to: payTo, validAfter },
    },
  });

  try {
    const hash = await wallet.writeContract({
      address: PERMIT2,
      abi: PERMIT2_ABI,
      functionName: "permitWitnessTransferFrom",
      args: [
        { permitted: { token, amount: BigInt(amount) }, nonce, deadline },
        { to: payTo, requestedAmount: BigInt(amount) },
        orchestrator.address,
        hashWitness(payTo, validAfter),
        WITNESS_TYPE_STRING,
        signature,
      ],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 90_000 });
    console.log(`  ${label}: ${receipt.status} ${hash}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  ${label}: FAILED`);
    console.log(`    ${message.split("\n").slice(0, 6).join("\n    ")}`);
    return false;
  }
}

console.log(`Token        ${token}`);
console.log(`Relayer      ${relayer.address}`);
console.log(`Orchestrator ${orchestrator.address}`);
console.log(`PayTo        ${payTo}\n`);

console.log("Sequential (control):");
await signAndSettle("seq-1", 10000);

console.log("\nParallel (reproduces the pipeline):");
await Promise.all([
  signAndSettle("par-1", 10000),
  signAndSettle("par-2", 20000),
  signAndSettle("par-3", 15000),
  signAndSettle("par-4", 20000),
]);
