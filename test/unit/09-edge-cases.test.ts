import { describe, it } from "node:test";
import { parseAbi, parseEther } from "viem";
import { deployBountyFixture, deployWithMultiFundersFixture } from "../shared/fixtures.js";
import { assertBigIntEqual, assertTrue } from "../shared/assertions.js";
import { increaseTime } from "../shared/helpers.js";

describe("09 - Edge Cases", () => {
  // NOTE: Hardhat 3.x auto-resets chain between tests with node:test runner
  // No manual beforeEach reset needed

  it("should handle zero funders edge case gracefully", async () => {
    const { bounty, publicClient, initial, decay } = await deployBountyFixture();

    // ABI for reading contract state
    const STATE_ABI = parseAbi([
      "function totalFunded() view returns (uint256)",
      "function finalized() view returns (bool)",
      "function refundsEnabled() view returns (bool)",
    ]);

    // Advance time past expiry without funding
    const expiryOffset = initial + decay + 10n;
    await increaseTime(expiryOffset);

    // Try to read contract state - should work even with zero funders
    const totalFunded = await publicClient.readContract({
      address: bounty,
      abi: STATE_ABI,
      functionName: "totalFunded",
    }) as bigint;

    const finalized = await publicClient.readContract({
      address: bounty,
      abi: STATE_ABI,
      functionName: "finalized",
    }) as boolean;

    const refundsEnabled = await publicClient.readContract({
      address: bounty,
      abi: STATE_ABI,
      functionName: "refundsEnabled",
    }) as boolean;

    // Verify state is valid
    assertBigIntEqual(totalFunded, 0n, "Total funded with zero funders");
    assertTrue(!finalized, "Not finalized without funding");
    assertTrue(!refundsEnabled, "Refunds not enabled without funding");
  });

  it("should handle large funder count (stress test)", async () => {
    // Deploy with maximum 5 funders
    const { bounty, publicClient, initial, decay, contributions } =
      await deployWithMultiFundersFixture(5);

    const STATE_ABI = parseAbi([
      "function totalFunded() view returns (uint256)",
      "function refundsEnabled() view returns (bool)",
      "function refundSnapshot() view returns (uint256)",
      "function refundAllEth()",
    ]);

    // Verify all 5 funders contributed
    const totalFunded = await publicClient.readContract({
      address: bounty,
      abi: STATE_ABI,
      functionName: "totalFunded",
    }) as bigint;

    const expectedTotal = contributions.reduce((sum, amount) => sum + amount, 0n);
    assertBigIntEqual(totalFunded, expectedTotal, "Total funded from 5 funders");

    // Advance time past expiry
    const expiryOffset = initial + decay + 100n;
    await increaseTime(expiryOffset);

    // Mine extra blocks to ensure timestamp advances
    const transport: any = (publicClient as any).transport;
    await transport.request({ method: "evm_mine", params: [] });
    await transport.request({ method: "evm_mine", params: [] });

    // Call refundAllEth() to process all 5 funders in batch
    const [deployer] = await (await import("hardhat")).network.connect().then(n => n.viem.getWalletClients());
    await deployer.writeContract({
      address: bounty,
      abi: STATE_ABI,
      functionName: "refundAllEth",
    });

    // Verify refunds were enabled and processed
    const refundsEnabled = await publicClient.readContract({
      address: bounty,
      abi: STATE_ABI,
      functionName: "refundsEnabled",
    }) as boolean;

    const refundSnapshot = await publicClient.readContract({
      address: bounty,
      abi: STATE_ABI,
      functionName: "refundSnapshot",
    }) as bigint;

    assertTrue(refundsEnabled, "Refunds enabled after refundAllEth()");
    assertBigIntEqual(refundSnapshot, expectedTotal, "Refund snapshot equals total funded");

    // Verify contract balance is now 0 (all refunds processed)
    const finalBalance = await publicClient.getBalance({ address: bounty });
    assertBigIntEqual(finalBalance, 0n, "Contract balance after refunding all 5 funders");
  });
});
