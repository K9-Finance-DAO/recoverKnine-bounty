import { describe, it } from "node:test";
import { deployExpiredFixture, deployWithMultiFundersFixture } from "../shared/fixtures.js";
import { assertReverts, assertBigIntEqual } from "../shared/assertions.js";
import { increaseTime } from "../shared/helpers.js";
import { parseAbi } from "viem";

describe("06 - Refund Distribution", () => {
  // NOTE: Hardhat 3.x auto-resets chain between tests with node:test runner
  // No manual beforeEach reset needed

  it("should process all funders with refundAllEth()", async () => {
    // Deploy with 3 funders
    const { bounty, publicClient, initial, decay } = await deployWithMultiFundersFixture(3);

    // Advance time past expiry
    await increaseTime(initial + decay + 10n);

    // Define ABI for refund operations
    const REFUND_ABI = parseAbi([
      "function refundAllEth()",
      "function refundCursor() view returns (uint256)",
    ]);

    // Call refundAllEth()
    const [deployer] = await (await import("hardhat")).network.connect().then(net => net.viem.getWalletClients());
    await deployer.writeContract({
      address: bounty,
      abi: REFUND_ABI,
      functionName: "refundAllEth",
    });

    // Check refundCursor === 3 (all funders processed)
    const refundCursor = await publicClient.readContract({
      address: bounty,
      abi: REFUND_ABI,
      functionName: "refundCursor",
    }) as bigint;

    assertBigIntEqual(refundCursor, 3n, "Refund cursor after refundAllEth");
  });

  it("should allow self-claim before batch processing", async () => {
    // Deploy with 3 funders
    const { bounty, publicClient, funders, funderAddresses, contributions, initial, decay } = await deployWithMultiFundersFixture(3);

    // Advance time past expiry
    await increaseTime(initial + decay + 10n);

    // Define ABI for refund operations
    const REFUND_ABI = parseAbi([
      "function claimRefund()",
      "function refundsAlreadyPaid(address) view returns (uint256)",
    ]);

    // Capture funder's balance before refund
    const funder = funders[0];
    const funderAddress = funderAddresses[0];
    const balanceBefore = await publicClient.getBalance({ address: funderAddress });

    // Funder calls claimRefund() before any batch processing
    await funder.writeContract({
      address: bounty,
      abi: REFUND_ABI,
      functionName: "claimRefund",
    });

    // Check their refund was paid
    const balanceAfter = await publicClient.getBalance({ address: funderAddress });
    const refundPaid = await publicClient.readContract({
      address: bounty,
      abi: REFUND_ABI,
      functionName: "refundsAlreadyPaid",
      args: [funderAddress],
    }) as bigint;

    // Balance should have increased (minus gas costs)
    // We just verify that a refund was recorded
    assertBigIntEqual(refundPaid, contributions[0], "Refund amount recorded");

    // Balance delta should be close to contribution (allowing for gas)
    const balanceDelta = balanceAfter - balanceBefore;
    const gasToleranceLower = contributions[0] - 1000000000000000n; // Allow for gas costs

    if (balanceDelta < gasToleranceLower) {
      throw new Error(`Balance delta ${balanceDelta} is too low, expected close to ${contributions[0]}`);
    }
  });

  it("should revert refundBatch with zero batch size", async () => {
    // Use deployExpiredFixture()
    const { bounty, wallets } = await deployExpiredFixture();

    // Define ABI for refund batch
    const REFUND_ABI = parseAbi([
      "function refundBatch(uint256)",
    ]);

    // Call refundBatch(0)
    await assertReverts(
      wallets[0].writeContract({
        address: bounty,
        abi: REFUND_ABI,
        functionName: "refundBatch",
        args: [0n],
      }),
      "BAD_BATCH_SIZE",
      {
        operation: "refundBatch with zero batch size",
        details: "Contract should reject batch size of 0",
      }
    );
  });

  it("should revert when no funders exist", async () => {
    // Deploy bounty WITHOUT funding
    const { viem } = await import("hardhat").then(hh => hh.network.connect());
    const publicClient = await viem.getPublicClient();
    const wallets = await viem.getWalletClients();

    // Setup mock KNINE
    const { setupMockKnine } = await import("../shared/helpers.js");
    await setupMockKnine();

    // Deploy bounty without any funding
    const { TEST_INITIAL_PERIOD, TEST_DECAY_PERIOD, TEST_TERMS_HASH } = await import("../shared/constants.js");
    const bounty = await viem.deployContract(
      "KnineRecoveryBountyDecayAcceptMultiFunder",
      [TEST_INITIAL_PERIOD, TEST_DECAY_PERIOD, TEST_TERMS_HASH]
    );

    const bountyAddress = bounty.address;

    // Read time periods from contract
    const periodsAbi = parseAbi([
      "function INITIAL() view returns (uint256)",
      "function DECAY() view returns (uint256)",
    ]);

    const [initial, decay] = await Promise.all([
      publicClient.readContract({
        address: bountyAddress,
        abi: periodsAbi,
        functionName: "INITIAL"
      }) as Promise<bigint>,
      publicClient.readContract({
        address: bountyAddress,
        abi: periodsAbi,
        functionName: "DECAY"
      }) as Promise<bigint>,
    ]);

    // Advance time past expiry
    await increaseTime(initial + decay + 10n);

    // Define ABI for refund batch
    const REFUND_ABI = parseAbi([
      "function refundBatch(uint256)",
    ]);

    // Call refundBatch(1) - should revert
    await assertReverts(
      wallets[0].writeContract({
        address: bountyAddress,
        abi: REFUND_ABI,
        functionName: "refundBatch",
        args: [1n],
      }),
      "NO_FUNDERS",
      {
        operation: "refundBatch with no funders",
        details: "Contract should reject refund batch when there are no funders",
      }
    );
  });
});
