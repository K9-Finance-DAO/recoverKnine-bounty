// Deploys 5 ETH bounty ERC20 and NFT contracts to Sepolia and verifies them on Etherscan.
import { network, run } from "hardhat";
import type { Address } from "viem";

const CONTRACTS = [
  {
    name: "ReturnKnineFor5ETHBountyERC20",
    fullyQualifiedName:
      "contracts/5_ETH_Bounty_for_Knine_Return_ERC20.sol:ReturnKnineFor5ETHBountyERC20",
  },
  {
    name: "ReturnKnineFor5ETHBountyNFT",
    fullyQualifiedName:
      "contracts/5_ETH_Bounty_for_Knine_Return_NFT.sol:ReturnKnineFor5ETHBountyNFT",
  },
] as const;

async function verifyContract(address: Address, fullyQualifiedName: string) {
  try {
    console.log(`Verifying ${fullyQualifiedName} at ${address}...`);
    await run("verify:verify", {
      address,
      contract: fullyQualifiedName,
      constructorArguments: [],
    });
    console.log(`Verification successful for ${fullyQualifiedName}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("already verified")) {
      console.log(`Contract already verified: ${fullyQualifiedName}.`);
      return;
    }
    throw error;
  }
}

async function main() {
  if (network.name !== "sepolia") {
    console.warn(
      `⚠️  Running on '${network.name}'. Pass --network sepolia to hardhat run to target Sepolia.`,
    );
  }

  const confirmationsEnv = process.env.DEPLOY_CONFIRMATIONS ?? "5";
  const confirmations = Number.parseInt(confirmationsEnv, 10);
  if (!Number.isFinite(confirmations) || confirmations < 1) {
    throw new Error(
      `DEPLOY_CONFIRMATIONS must be a positive integer (received '${confirmationsEnv}').`,
    );
  }

  const { viem } = await network.connect();
  const [walletClient] = await viem.getWalletClients();
  if (!walletClient) {
    throw new Error("No wallet client available. Check SEPOLIA_PRIVATE_KEY in the environment.");
  }

  const deployer = walletClient.account.address;
  console.log(`Deploying contracts from ${deployer} to ${network.name}...`);

  for (const contract of CONTRACTS) {
    console.log(`Deploying ${contract.name}...`);
    const instance = await viem.deployContract(contract.name, [], { confirmations });
    console.log(`${contract.name} deployed at ${instance.address}.`);

    await verifyContract(instance.address, contract.fullyQualifiedName);
  }

  console.log("All contracts deployed and verified.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
