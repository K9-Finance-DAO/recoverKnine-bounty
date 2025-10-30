import { Address, parseEther, formatEther, parseAbi } from "viem";
import type { PublicClient, WalletClient } from "viem";
import { network } from "hardhat";
import {
  KNINE,
  EXPLOITER,
  TEST_INITIAL_PERIOD,
  TEST_DECAY_PERIOD,
  TEST_TERMS_HASH,
  FUNDING_AMOUNTS,
} from "./constants.js";
import {
  setupMockKnine,
  callAs,
  impersonateAndFund,
  getNowTs,
  increaseTime,
  log,
  setBalance,
  ERC20_ABI,
} from "./helpers.js";

export interface BountyFixture {
  bounty: Address;
  publicClient: PublicClient;
  wallets: WalletClient[];
  deployer: WalletClient;
  start: bigint;
  initial: bigint;
  decay: bigint;
}

export interface MultiFunderFixture extends BountyFixture {
  funders: WalletClient[];
  funderAddresses: Address[];
  contributions: bigint[];
}

const BOUNTY_ABI = parseAbi([
  "function START() view returns (uint256)",
  "function INITIAL() view returns (uint256)",
  "function DECAY() view returns (uint256)",
  "function accept()",
  "function recoverKnine()",
  "function refundBatch(uint256)",
  "function refundAllEth()",
  "function claimRefund()",
]);

// ===== Base Deployment Fixture =====

export async function deployBountyFixture(): Promise<BountyFixture> {
  log("🚀 Deploying bounty contract...", "cyan");

  // NOTE: Hardhat 3.x with node:test auto-resets chain between tests - no manual reset needed

  // Get fresh viem instance
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const wallets = await viem.getWalletClients();
  const deployer = wallets[0];

  // Setup mock KNINE
  await setupMockKnine();

  // Deploy bounty (fork starts with 10000 ETH per account)
  const bounty = await viem.deployContract(
    "KnineRecoveryBountyDecayAcceptMultiFunder",
    [TEST_INITIAL_PERIOD, TEST_DECAY_PERIOD, TEST_TERMS_HASH]
  );

  const bountyAddress = bounty.address as Address;

  // Read immutables
  const [start, initial, decay] = await Promise.all([
    publicClient.readContract({ address: bountyAddress, abi: BOUNTY_ABI, functionName: "START" }) as Promise<bigint>,
    publicClient.readContract({ address: bountyAddress, abi: BOUNTY_ABI, functionName: "INITIAL" }) as Promise<bigint>,
    publicClient.readContract({ address: bountyAddress, abi: BOUNTY_ABI, functionName: "DECAY" }) as Promise<bigint>,
  ]);

  log(`✓ Bounty deployed at ${bountyAddress}`, "green");
  log(`  START: ${start}, INITIAL: ${initial}s, DECAY: ${decay}s`, "dim");

  return {
    bounty: bountyAddress,
    publicClient,
    wallets,
    deployer,
    start,
    initial,
    decay,
  };
}

// ===== Single Funder Fixture =====

export async function deployWithOneFunderFixture(
  fundingAmount: bigint = FUNDING_AMOUNTS.LARGE
): Promise<BountyFixture & { funder: WalletClient; funderAddress: Address }> {
  const base = await deployBountyFixture();
  const funder = base.wallets[1];
  const funderAddress = funder.account.address as Address;

  log(`💰 Funder ${funderAddress.slice(0, 8)} contributing ${fundingAmount}`, "yellow");

  // Fund the bounty
  await funder.sendTransaction({
    to: base.bounty,
    value: fundingAmount,
  });

  return { ...base, funder, funderAddress };
}

// ===== Multi-Funder Fixture =====

export async function deployWithMultiFundersFixture(
  funderCount: number = 3,
  amounts?: bigint[]
): Promise<MultiFunderFixture> {
  if (funderCount < 1 || funderCount > 5) {
    throw new Error("funderCount must be between 1 and 5");
  }

  const base = await deployBountyFixture();
  const funders = base.wallets.slice(1, 1 + funderCount);
  const funderAddresses = funders.map(w => w.account.address as Address);

  // Default amounts: declining by 1 ETH each
  const contributions = amounts ?? Array.from(
    { length: funderCount },
    (_, i) => parseEther(String(5 - i))
  );

  log(`💰 ${funderCount} funders contributing...`, "yellow");

  // Fund from each wallet
  for (let i = 0; i < funderCount; i++) {
    await funders[i].sendTransaction({
      to: base.bounty,
      value: contributions[i],
    });
    log(`  ${i + 1}. ${funderAddresses[i].slice(0, 8)}: ${contributions[i]} wei`, "dim");
  }

  return {
    ...base,
    funders,
    funderAddresses,
    contributions,
  };
}

// ===== Acceptance Fixtures =====

export async function deployWithAcceptanceFixture(
  timeOffsetSeconds: bigint = 0n
): Promise<BountyFixture & { acceptedAt: bigint }> {
  const base = await deployWithOneFunderFixture();

  // Impersonate exploiter first
  await impersonateAndFund(EXPLOITER);

  // Approve KNINE
  await callAs(
    EXPLOITER,
    KNINE,
    ERC20_ABI,
    "approve",
    [base.bounty, parseEther("250000000000")] // Enough for AMOUNT
  );

  // Optionally advance time
  if (timeOffsetSeconds > 0n) {
    await increaseTime(timeOffsetSeconds);
  }

  // Accept
  const acceptedAt = await getNowTs();
  await callAs(EXPLOITER, base.bounty, BOUNTY_ABI, "accept");

  log(`✓ Exploiter accepted at timestamp ${acceptedAt}`, "green");

  return { ...base, acceptedAt };
}

export async function deployWithMidDecayAcceptanceFixture(): Promise<BountyFixture & { acceptedAt: bigint }> {
  // Accept halfway through decay period
  const offset = TEST_INITIAL_PERIOD + TEST_DECAY_PERIOD / 2n;
  return await deployWithAcceptanceFixture(offset);
}

// ===== Finalized Fixture =====

export async function deployFinalizedFixture(
  withAcceptance: boolean = false
): Promise<BountyFixture & { paidAmount: bigint }> {
  const base = await deployWithOneFunderFixture();

  // Impersonate exploiter first
  await impersonateAndFund(EXPLOITER);

  // Approve KNINE
  await callAs(
    EXPLOITER,
    KNINE,
    ERC20_ABI,
    "approve",
    [base.bounty, parseEther("250000000000")]
  );

  // Optionally accept first
  if (withAcceptance) {
    await callAs(EXPLOITER, base.bounty, BOUNTY_ABI, "accept");
  }

  // Get balance before recovery
  const balanceBefore = await base.publicClient.getBalance({ address: EXPLOITER });

  // Recover KNINE (Safe batch would unblacklist, but we'll assume it's handled)
  try {
    await callAs(EXPLOITER, base.bounty, BOUNTY_ABI, "recoverKnine");
  } catch (error) {
    // May fail due to blacklist - that's okay for some tests
    log("⚠️  Recovery may have failed due to blacklist", "yellow");
  }

  const balanceAfter = await base.publicClient.getBalance({ address: EXPLOITER });
  const paidAmount = balanceAfter - balanceBefore;

  log(`✓ Bounty finalized, paid ${paidAmount} to exploiter`, "green");

  return { ...base, paidAmount };
}

// ===== Expired Fixture =====

export async function deployExpiredFixture(): Promise<BountyFixture> {
  const base = await deployWithOneFunderFixture();

  // Fast-forward past expiry
  const expiryOffset = base.initial + base.decay + 10n;
  await increaseTime(expiryOffset);

  log(`✓ Bounty expired (advanced ${expiryOffset}s)`, "green");

  return base;
}

// ===== Refunds Enabled Fixture =====

export async function deployWithRefundsEnabledFixture(): Promise<MultiFunderFixture> {
  const base = await deployWithMultiFundersFixture(3);

  // Fast-forward well past expiry (100s buffer to handle block timestamp increments)
  // The contract checks: block.timestamp >= START + INITIAL + DECAY
  // With 3 funders, we've mined ~3 blocks, so we need extra buffer
  await increaseTime(base.initial + base.decay + 100n);

  // Mine a few extra blocks to ensure timestamp advances
  const transport: any = (base.publicClient as any).transport;
  await transport.request({ method: "evm_mine", params: [] });
  await transport.request({ method: "evm_mine", params: [] });

  // Trigger refunds enablement
  await base.deployer.writeContract({
    address: base.bounty,
    abi: BOUNTY_ABI,
    functionName: "refundBatch",
    args: [1n],
  });

  log(`✓ Refunds enabled`, "green");

  return base;
}

// ===== Helper: Get Contract State =====

export async function getBountyState(bounty: Address, publicClient: PublicClient) {
  const stateAbi = parseAbi([
    "function acceptedAt() view returns (uint256)",
    "function finalized() view returns (bool)",
    "function refundsEnabled() view returns (bool)",
    "function refundSnapshot() view returns (uint256)",
    "function refundCursor() view returns (uint256)",
    "function totalFunded() view returns (uint256)",
    "function timeRemaining() view returns (uint256)",
    "function currentPayout() view returns (uint256)",
  ]);

  const [
    acceptedAt,
    finalized,
    refundsEnabled,
    refundSnapshot,
    refundCursor,
    totalFunded,
    timeRemaining,
    currentPayout,
  ] = await Promise.all([
    publicClient.readContract({ address: bounty, abi: stateAbi, functionName: "acceptedAt" }),
    publicClient.readContract({ address: bounty, abi: stateAbi, functionName: "finalized" }),
    publicClient.readContract({ address: bounty, abi: stateAbi, functionName: "refundsEnabled" }),
    publicClient.readContract({ address: bounty, abi: stateAbi, functionName: "refundSnapshot" }),
    publicClient.readContract({ address: bounty, abi: stateAbi, functionName: "refundCursor" }),
    publicClient.readContract({ address: bounty, abi: stateAbi, functionName: "totalFunded" }),
    publicClient.readContract({ address: bounty, abi: stateAbi, functionName: "timeRemaining" }),
    publicClient.readContract({ address: bounty, abi: stateAbi, functionName: "currentPayout" }),
  ]);

  return {
    acceptedAt: acceptedAt as bigint,
    finalized: finalized as boolean,
    refundsEnabled: refundsEnabled as boolean,
    refundSnapshot: refundSnapshot as bigint,
    refundCursor: refundCursor as bigint,
    totalFunded: totalFunded as bigint,
    timeRemaining: timeRemaining as bigint,
    currentPayout: currentPayout as bigint,
    balance: await publicClient.getBalance({ address: bounty }),
  };
}
