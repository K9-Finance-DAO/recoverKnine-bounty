// pnpm hardhat run scripts/estimate-20eth-nft.ts --network mainnet

import { artifacts, network } from "hardhat";
import { formatEther, encodeDeployData, EstimateGasExecutionError } from "viem";
import type { Address } from "viem";

const CONTRACT_NAME = "ReturnKnineFor20ETHBountyNFT";
const BOUNTY_ADDRESS = "0x5EA23706708F727F1AF45718c4903DdA2526D4d0" as Address;

async function main() {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [wallet] = await viem.getWalletClients();
  if (!wallet) throw new Error("No signer; check MAINNET_PRIVATE_KEY");

  const artifact = await artifacts.readArtifact(CONTRACT_NAME);
  const deployCalldata = encodeDeployData({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [BOUNTY_ADDRESS],
  });

  // Estimate the gas units needed to deploy the NFT contract.
  let gas: bigint;
  try {
    gas = await publicClient.estimateGas({
      account: wallet.account,
      data: deployCalldata,
    });
  } catch (error) {
    if (error instanceof EstimateGasExecutionError) {
      console.error(
        "Gas estimation failed – ensure the bounty contract address exists on the target network and that your node can access it.",
      );
    }
    throw error;
  }
  console.log(`Estimated gas units: ${gas}`);

  const fees = await publicClient.estimateFeesPerGas();
  if (
    fees.maxFeePerGas === undefined ||
    fees.maxPriorityFeePerGas === undefined
  ) {
    const gasPrice = await publicClient.getGasPrice();
    const legacyTotal = gas * gasPrice;
    console.log(
      `Legacy gas price: ${gasPrice} wei (${formatEther(gasPrice)} ETH)`,
    );
    console.log(
      `Total ETH needed at that gas price: ${formatEther(legacyTotal)} ETH`,
    );
    return;
  }

  const { maxFeePerGas, maxPriorityFeePerGas } = fees;
  console.log(
    `Suggested max fee per gas: ${maxFeePerGas} wei (${formatEther(
      maxFeePerGas,
    )} ETH)`,
  );
  console.log(
    `Suggested priority fee: ${maxPriorityFeePerGas} wei (${formatEther(
      maxPriorityFeePerGas,
    )} ETH)`,
  );

  const total = gas * maxFeePerGas;
  console.log(
    `Total ETH needed at that cap: ${formatEther(
      total,
    )} (add a buffer for price spikes)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
