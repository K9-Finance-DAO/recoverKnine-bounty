#!/usr/bin/env node
import { execSync } from "node:child_process";

const targets = {
  erc20: {
    contract: "contracts/5_ETH_Bounty_for_Knine_Return_ERC20.sol:ReturnKnineFor5ETHBountyERC20",
    envVar: "SEPOLIA_ERC20_ADDRESS",
  },
  nft: {
    contract: "contracts/5_ETH_Bounty_for_Knine_Return_NFT.sol:ReturnKnineFor5ETHBountyNFT",
    envVar: "SEPOLIA_NFT_ADDRESS",
  },
};

const [targetKey, addressFromCli] = process.argv.slice(2);
if (!targetKey || !(targetKey in targets)) {
  const available = Object.keys(targets).join(", ");
  console.error(`Usage: pnpm run verify:sepolia <${available}> [address]`);
  process.exit(1);
}

const target = targets[targetKey];
const address = addressFromCli ?? process.env[target.envVar];
if (!address) {
  console.error(
    `Contract address is required. Pass it as an argument or set ${target.envVar}.`,
  );
  process.exit(1);
}

const args = [
  "npx",
  "hardhat",
  "verify",
  "--network",
  "sepolia",
  "--contract",
  target.contract,
  address,
];

console.log(`Verifying ${targetKey} at ${address} on sepolia...`);
execSync(args.join(" "), {
  stdio: "inherit",
});
