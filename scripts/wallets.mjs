/**
 * Generates the three wallets AgentMesh needs and prints them as .env lines.
 *
 *   node scripts/wallets.mjs
 *
 * Roles:
 *   RELAYER      — facilitator; pays gas on every settle, and is the Permit2
 *                  spender the payer signs against (Permit2 checks msg.sender).
 *   ORCHESTRATOR — pays each agent invoice. Needs mUSD, not BNB.
 *   PAY_TO       — receives agent revenue. Keyless in production; a key here
 *                  only so the demo can sweep funds back.
 *
 * Testnet keys only. Never reuse these on mainnet.
 */

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

function make(role) {
  const privateKey = generatePrivateKey();
  return { role, privateKey, address: privateKeyToAccount(privateKey).address };
}

const relayer = make("RELAYER");
const orchestrator = make("ORCHESTRATOR");
const payTo = make("PAY_TO");

console.log("# AgentMesh wallets — BSC Testnet only");
console.log("# Fund RELAYER with testnet BNB: https://www.bnbchain.org/en/testnet-faucet");
console.log("");
console.log(`RELAYER_PRIVATE_KEY=${relayer.privateKey}`);
console.log(`ORCHESTRATOR_PRIVATE_KEY=${orchestrator.privateKey}`);
console.log(`PAY_TO_PRIVATE_KEY=${payTo.privateKey}`);
console.log(`NEXT_PUBLIC_PAY_TO_ADDRESS=${payTo.address}`);
console.log("");
console.log("# Addresses");
for (const wallet of [relayer, orchestrator, payTo]) {
  console.log(`# ${wallet.role.padEnd(13)} ${wallet.address}`);
}
