/**
 * Compiles contracts/MeshUSD.sol with solc and writes the artifact to
 * build/MeshUSD.json.
 *
 * Uses solc's JS binding directly rather than Hardhat or Foundry — one contract
 * does not justify a toolchain, and this keeps the repo installable with npm
 * alone.
 *
 *   node scripts/compile.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_NAME = "MeshUSD.sol";
const CONTRACT_NAME = "MeshUSD";

const source = readFileSync(join(root, "contracts", SOURCE_NAME), "utf8");

const input = {
  language: "Solidity",
  sources: { [SOURCE_NAME]: { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "paris",
    outputSelection: {
      "*": { "*": ["abi", "evm.bytecode.object"] },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

const errors = (output.errors ?? []).filter((e) => e.severity === "error");
if (errors.length > 0) {
  for (const error of errors) {
    console.error(error.formattedMessage ?? error.message);
  }
  process.exit(1);
}

for (const warning of output.errors ?? []) {
  console.warn(warning.formattedMessage ?? warning.message);
}

const contract = output.contracts?.[SOURCE_NAME]?.[CONTRACT_NAME];
if (!contract) {
  console.error(`Compiler produced no output for ${CONTRACT_NAME}`);
  process.exit(1);
}

const artifact = {
  contractName: CONTRACT_NAME,
  abi: contract.abi,
  bytecode: `0x${contract.evm.bytecode.object}`,
  compiler: solc.version(),
};

mkdirSync(join(root, "build"), { recursive: true });
writeFileSync(
  join(root, "build", `${CONTRACT_NAME}.json`),
  `${JSON.stringify(artifact, null, 2)}\n`,
);

console.log(`Compiled ${CONTRACT_NAME} with solc ${solc.version()}`);
console.log(`Bytecode: ${artifact.bytecode.length / 2 - 1} bytes`);
