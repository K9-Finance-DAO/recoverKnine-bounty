// Deploy KnineRecoveryBountyDecayAccept to Sepolia (real network)
import { network, run } from "hardhat";

async function main() {
  // Config via env, with sensible defaults
  const INITIAL_DAYS = BigInt(process.env.INITIAL_DAYS ?? "7"); // 7 days at 100%
  const DECAY_DAYS = BigInt(process.env.DECAY_DAYS ?? "23"); // 23 days decay
  const TERMS_HASH = (process.env.TERMS_HASH ??
    "0xce05e792f591bc617f475e9be1d00df89446c592738f73ff72b23c84107e645e") as `0x${string}`;
  const FUND_WEI = BigInt(process.env.FUND_WEI ?? "0"); // e.g. 5000000000000000000 for 5 ETH
  const confirmations = Number.parseInt(process.env.DEPLOY_CONFIRMATIONS ?? "5", 10);

  const initial = INITIAL_DAYS * 24n * 60n * 60n;
  const decay = DECAY_DAYS * 24n * 60n * 60n;

  if (network.name !== "sepolia") {
    console.warn(`⚠️  Running on '${network.name}'. Pass --network sepolia to target Sepolia.`);
  }

  const { viem } = await network.connect();
  const [wallet] = await viem.getWalletClients();
  if (!wallet) throw new Error("No wallet client. Check SEPOLIA_PRIVATE_KEY.");
  console.log(`Deployer: ${wallet.account.address}`);

  console.log("Deploying KnineRecoveryBountyDecayAccept...");
  const instance = await viem.deployContract(
    "KnineRecoveryBountyDecayAccept",
    [initial, decay, TERMS_HASH],
    { value: FUND_WEI, confirmations },
  );
  console.log(`Bounty deployed at: ${instance.address}`);

  if (process.env.VERIFY === "1") {
    try {
      console.log("Verifying on Etherscan...");
      await run("verify:verify", {
        address: instance.address,
        constructorArguments: [Number(initial), Number(decay), TERMS_HASH],
      });
      console.log("Verification successful.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("already verified")) {
        console.log("Already verified.");
      } else {
        throw err;
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

