import { network } from "hardhat";
import type { Address } from "viem";

const BOUNTY: Address = "0x5EA23706708F727F1AF45718c4903DdA2526D4d0" as Address;

async function main() {
  const { viem } = await network.connect();
  const [wallet] = await viem.getWalletClients();
  if (!wallet) throw new Error("No signer; check your PRIVATE_KEY env var");

  console.log(`Deploying from ${wallet.account.address}…`);
  const nft = await viem.deployContract(
    "ReturnKnineFor20ETHBountyNFT",
    [BOUNTY],
    { confirmations: Number(process.env.DEPLOY_CONFIRMATIONS ?? 5) },
  );
  console.log(`NFT deployed at ${nft.address}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
