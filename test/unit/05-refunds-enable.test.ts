import { describe, it } from "node:test";
import { deployExpiredFixture, deployWithAcceptanceFixture } from "../shared/fixtures.js";
import { assertReverts, assertTrue } from "../shared/assertions.js";
import { parseAbi } from "viem";

describe("05 - Refunds Enablement", () => {
  // NOTE: Hardhat 3.x auto-resets chain between tests with node:test runner
  // No manual beforeEach reset needed

  it("should successfully enable refunds after expiry without acceptance", async () => {
    const { bounty, publicClient } = await deployExpiredFixture();

    const batchAbi = parseAbi([
      "function refundBatch(uint256)",
      "function refundsEnabled() view returns (bool)",
    ]);

    // Call refundBatch to trigger enablement
    await publicClient.writeContract({
      address: bounty,
      abi: batchAbi,
      functionName: "refundBatch",
      args: [1n],
    });

    // Read refundsEnabled state
    const refundsEnabled = (await publicClient.readContract({
      address: bounty,
      abi: batchAbi,
      functionName: "refundsEnabled",
    })) as boolean;

    // Assert it's true
    assertTrue(refundsEnabled, "Refunds should be enabled after calling refundBatch");
  });

  it("should allow calling refundBatch multiple times (idempotent)", async () => {
    const { bounty, publicClient } = await deployExpiredFixture();

    const batchAbi = parseAbi([
      "function refundBatch(uint256)",
      "function refundsEnabled() view returns (bool)",
    ]);

    // Call refundBatch first time
    await publicClient.writeContract({
      address: bounty,
      abi: batchAbi,
      functionName: "refundBatch",
      args: [1n],
    });

    // Call refundBatch second time (should be no-op)
    await publicClient.writeContract({
      address: bounty,
      abi: batchAbi,
      functionName: "refundBatch",
      args: [1n],
    });

    // Read refundsEnabled state
    const refundsEnabled = (await publicClient.readContract({
      address: bounty,
      abi: batchAbi,
      functionName: "refundsEnabled",
    })) as boolean;

    // Assert it's true
    assertTrue(refundsEnabled, "Refunds should remain enabled after multiple refundBatch calls");
  });
});
