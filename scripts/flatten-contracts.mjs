#!/usr/bin/env node
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const rootDir = path.resolve(process.cwd());
const outDir = path.join(rootDir, "flattened");

const contracts = [
  {
    source: "contracts/5_ETH_Bounty_for_Knine_Return_ERC20.sol",
    output: path.join(outDir, "5_ETH_Bounty_for_Knine_Return_ERC20.flattened.sol"),
  },
  {
    source: "contracts/5_ETH_Bounty_for_Knine_Return_NFT.sol",
    output: path.join(outDir, "5_ETH_Bounty_for_Knine_Return_NFT.flattened.sol"),
  },
];

function tidyFlatten(flattened) {
  const lines = flattened.split(/\r?\n/);
  let seenSpdx = false;
  const withoutDuplicateSpdx = lines.filter((line) => {
    if (line.startsWith("// SPDX")) {
      if (seenSpdx) {
        return false;
      }
      seenSpdx = true;
    }
    return true;
  });

  const deduped = withoutDuplicateSpdx.join("\n");

  const [prefix, ...rest] = deduped.split(/(?=\/\/ File )/);
  if (rest.length === 0) {
    return deduped;
  }

  const fileBlocks = rest.join("").match(/\/\/ File [\s\S]*?(?=\/\/ File |$)/g) ?? [];
  if (fileBlocks.length <= 1) {
    return prefix + fileBlocks.join("");
  }

  const firstBlock = fileBlocks.shift();
  fileBlocks.push(firstBlock);

  return prefix + fileBlocks.join("");
}

function flattenContract({ source, output }) {
  const command = `npx hardhat flatten ${source}`;
  const flattened = execSync(command, {
    cwd: rootDir,
    stdio: ["ignore", "pipe", "inherit"],
    encoding: "utf8",
  });

  const cleaned = tidyFlatten(flattened).trimEnd() + "\n";
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, cleaned, "utf8");
  console.log(`Flattened ${source} -> ${path.relative(rootDir, output)}`);
}

for (const contract of contracts) {
  flattenContract(contract);
}
