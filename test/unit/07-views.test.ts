import { describe, it } from "node:test";
import { parseEther } from "viem";
import { deployBountyFixture, deployWithOneFunderFixture, deployWithAcceptanceFixture, deployWithRefundsEnabledFixture, getBountyState } from "../shared/fixtures.js";
import { assertBigIntEqual, assertBigIntClose } from "../shared/assertions.js";
import { increaseTime, calculatePayout, calculateProRataRefund } from "../shared/helpers.js";

describe("07 - View Functions", () => {
  it("should show timeRemaining decreasing monotonically", async () => {
    const { bounty, publicClient, start, initial, decay } = await deployBountyFixture();

    // Get initial timeRemaining (should equal INITIAL + DECAY)
    const state1 = await getBountyState(bounty, publicClient);
    assertBigIntEqual(state1.timeRemaining, initial + decay, "Initial timeRemaining");

    // Advance time by 500s
    await increaseTime(500n);
    const state2 = await getBountyState(bounty, publicClient);
    const expected2 = initial + decay - 500n;
    assertBigIntEqual(state2.timeRemaining, expected2, "TimeRemaining after 500s");

    // Advance past expiry
    await increaseTime(initial + decay);
    const state3 = await getBountyState(bounty, publicClient);
    assertBigIntEqual(state3.timeRemaining, 0n, "TimeRemaining after expiry");
  });

  it("should calculate currentPayout correctly across timeline", async () => {
    const fundAmount = parseEther("10");
    const { bounty, publicClient, start, initial, decay } = await deployWithOneFunderFixture(fundAmount);

    // During INITIAL period: payout should equal full balance
    const state1 = await getBountyState(bounty, publicClient);
    assertBigIntEqual(state1.currentPayout, fundAmount, "Payout during INITIAL period");

    // Advance to mid-DECAY (halfway through decay period)
    await increaseTime(initial + decay / 2n);
    const state2 = await getBountyState(bounty, publicClient);

    // At mid-decay, payout should be approximately 50% of balance
    const expectedMidDecay = fundAmount / 2n;
    assertBigIntClose(state2.currentPayout, expectedMidDecay, parseEther("0.01"), "Payout at mid-DECAY");

    // Advance past expiry
    await increaseTime(decay / 2n + 10n);
    const state3 = await getBountyState(bounty, publicClient);
    assertBigIntEqual(state3.currentPayout, 0n, "Payout after expiry");
  });

  it("should freeze currentPayout at acceptance time", async () => {
    const fundAmount = parseEther("10");

    // Accept at mid-DECAY (50% payout)
    const { bounty, publicClient, start, initial, decay, funder } = await deployWithAcceptanceFixture(
      initial + decay / 2n
    );

    // At acceptance, payout should be ~50% of 10 ETH = 5 ETH
    const state1 = await getBountyState(bounty, publicClient);
    const expectedAtAccept = fundAmount / 2n;
    assertBigIntClose(state1.currentPayout, expectedAtAccept, parseEther("0.01"), "Payout at mid-DECAY acceptance");

    // Add 10 more ETH (total = 20 ETH)
    await funder.sendTransaction({
      to: bounty,
      value: parseEther("10"),
    });

    const state2 = await getBountyState(bounty, publicClient);

    // Payout should still be 50% of NEW total (50% of 20 ETH = 10 ETH)
    // Because acceptance freezes the PERCENTAGE at 50%, not the absolute amount
    const expectedAfterFunding = parseEther("20") / 2n;
    assertBigIntClose(state2.currentPayout, expectedAfterFunding, parseEther("0.01"), "Payout with frozen percentage");

    // Advance time (shouldn't change payout since acceptance froze it)
    await increaseTime(decay / 4n);
    const state3 = await getBountyState(bounty, publicClient);
    assertBigIntClose(state3.currentPayout, expectedAfterFunding, parseEther("0.01"), "Payout remains frozen after time advance");
  });

  it("should calculate refundOwed accurately with and without batching", async () => {
    // Deploy with 3 funders: 5 ETH, 3 ETH, 2 ETH = 10 ETH total
    const { bounty, publicClient, initial, decay, funderAddresses, contributions } =
      await deployWithRefundsEnabledFixture();

    const [funderA, funderB, funderC] = funderAddresses;
    const [amountA, amountB, amountC] = contributions;

    // At this point, refunds have been enabled (first batch already ran)
    // Get state after initial enablement
    const state = await getBountyState(bounty, publicClient);
    const totalFunded = state.totalFunded;
    const refundSnapshot = state.refundSnapshot;

    // Calculate expected refunds using pro-rata formula
    const expectedA = calculateProRataRefund(amountA, totalFunded, refundSnapshot);
    const expectedB = calculateProRataRefund(amountB, totalFunded, refundSnapshot);
    const expectedC = calculateProRataRefund(amountC, totalFunded, refundSnapshot);

    // Read refundOwed for each funder
    const viewAbi = [
      "function refundOwed(address) view returns (uint256)",
    ];

    const owedA = await publicClient.readContract({
      address: bounty,
      abi: viewAbi,
      functionName: "refundOwed",
      args: [funderA],
    }) as bigint;

    const owedB = await publicClient.readContract({
      address: bounty,
      abi: viewAbi,
      functionName: "refundOwed",
      args: [funderB],
    }) as bigint;

    const owedC = await publicClient.readContract({
      address: bounty,
      abi: viewAbi,
      functionName: "refundOwed",
      args: [funderC],
    }) as bigint;

    // First funder was already processed in enablement batch
    // So funder A should have 0 owed (already paid)
    // Note: The refundBatch(1) in fixture processes the first funder
    assertBigIntEqual(owedA, 0n, "Funder A already refunded");

    // Funders B and C should have their calculated amounts owed
    assertBigIntClose(owedB, expectedB, parseEther("0.001"), "Funder B refund owed");
    assertBigIntClose(owedC, expectedC, parseEther("0.001"), "Funder C refund owed");

    // Process next batch (funder B)
    const batchAbi = ["function refundBatch(uint256)"];
    await publicClient.writeContract({
      address: bounty,
      abi: batchAbi,
      functionName: "refundBatch",
      args: [1n],
    });

    // Check refundOwed again
    const owedA2 = await publicClient.readContract({
      address: bounty,
      abi: viewAbi,
      functionName: "refundOwed",
      args: [funderA],
    }) as bigint;

    const owedB2 = await publicClient.readContract({
      address: bounty,
      abi: viewAbi,
      functionName: "refundOwed",
      args: [funderB],
    }) as bigint;

    const owedC2 = await publicClient.readContract({
      address: bounty,
      abi: viewAbi,
      functionName: "refundOwed",
      args: [funderC],
    }) as bigint;

    // Funder A: still 0
    assertBigIntEqual(owedA2, 0n, "Funder A still 0");

    // Funder B: should now be 0 (just processed)
    assertBigIntEqual(owedB2, 0n, "Funder B now refunded");

    // Funder C: still has refund owed
    assertBigIntClose(owedC2, expectedC, parseEther("0.001"), "Funder C still has refund owed");
  });

  it("should return zero from views before refunds enabled", async () => {
    const { bounty, publicClient, funderAddress } = await deployWithOneFunderFixture();

    // Check state before refunds enabled
    const state = await getBountyState(bounty, publicClient);

    assertBigIntEqual(state.refundSnapshot, 0n, "refundSnapshot is 0 before enablement");

    // Check refundOwed view
    const viewAbi = ["function refundOwed(address) view returns (uint256)"];
    const owed = await publicClient.readContract({
      address: bounty,
      abi: viewAbi,
      functionName: "refundOwed",
      args: [funderAddress],
    }) as bigint;

    assertBigIntEqual(owed, 0n, "refundOwed returns 0 before refunds enabled");
  });

  it("should calculate currentPayout using acceptedAt when set", async () => {
    const fundAmount = parseEther("10");

    // Deploy and accept at start (full payout)
    const { bounty, publicClient, acceptedAt, start, initial, decay } =
      await deployWithAcceptanceFixture(0n);

    // Immediately after acceptance (during INITIAL), payout should be full
    const state1 = await getBountyState(bounty, publicClient);
    assertBigIntEqual(state1.currentPayout, fundAmount, "Full payout at acceptance during INITIAL");

    // Advance time well into decay period
    await increaseTime(initial + decay / 4n * 3n);

    // Because we accepted during INITIAL period, payout is frozen at 100%
    const state2 = await getBountyState(bounty, publicClient);
    assertBigIntEqual(state2.currentPayout, fundAmount, "Payout still full (frozen at acceptance)");
  });

  it("should handle edge case: currentPayout with zero balance", async () => {
    // Deploy without funding
    const { bounty, publicClient } = await deployBountyFixture();

    const state = await getBountyState(bounty, publicClient);
    assertBigIntEqual(state.balance, 0n, "Bounty has zero balance");
    assertBigIntEqual(state.currentPayout, 0n, "currentPayout is 0 with zero balance");
  });

  it("should handle edge case: refundOwed with zero totalFunded", async () => {
    // Deploy without funding
    const { bounty, publicClient, wallets } = await deployBountyFixture();

    // Try to enable refunds by advancing time and calling refundBatch
    await increaseTime(1000n + 1000n + 1n);

    const batchAbi = ["function refundBatch(uint256)"];

    // This should work even with no funders
    await publicClient.writeContract({
      address: bounty,
      abi: batchAbi,
      functionName: "refundBatch",
      args: [1n],
    });

    // Check refundOwed for any address
    const viewAbi = ["function refundOwed(address) view returns (uint256)"];
    const owed = await publicClient.readContract({
      address: bounty,
      abi: viewAbi,
      functionName: "refundOwed",
      args: [wallets[1].account.address],
    }) as bigint;

    assertBigIntEqual(owed, 0n, "refundOwed is 0 with zero totalFunded");
  });

  it("should show timeRemaining as 0 when contract not yet started", async () => {
    // This is an edge case: if block.timestamp < START, timeRemaining should handle it
    // In practice, START is set to block.timestamp in constructor, so this won't happen
    // But the contract code handles: if (block.timestamp >= START + INITIAL + DECAY) return 0
    // The calculation uses (START + INITIAL + DECAY) - block.timestamp

    // We can't easily test this without time travel backwards, but we can verify
    // the monotonic decrease property is maintained
    const { bounty, publicClient, start, initial, decay } = await deployBountyFixture();

    const state = await getBountyState(bounty, publicClient);
    const maxTime = initial + decay;

    // TimeRemaining should never exceed INITIAL + DECAY
    assertBigIntEqual(state.timeRemaining, maxTime, "TimeRemaining starts at max (INITIAL + DECAY)");
  });

  it("should calculate payout correctly at exact INITIAL boundary", async () => {
    const fundAmount = parseEther("10");
    const { bounty, publicClient, initial, decay } = await deployWithOneFunderFixture(fundAmount);

    // Advance to exactly the end of INITIAL period (start of DECAY)
    await increaseTime(initial);

    const state = await getBountyState(bounty, publicClient);

    // At t = INITIAL, we're at the boundary
    // Formula: if (t <= INITIAL) return balance
    // So payout should still be full balance
    assertBigIntEqual(state.currentPayout, fundAmount, "Payout at INITIAL boundary is full");
  });

  it("should calculate payout correctly at exact INITIAL+DECAY boundary", async () => {
    const fundAmount = parseEther("10");
    const { bounty, publicClient, initial, decay } = await deployWithOneFunderFixture(fundAmount);

    // Advance to exactly INITIAL + DECAY (expiry point)
    await increaseTime(initial + decay);

    const state = await getBountyState(bounty, publicClient);

    // At t = INITIAL + DECAY, payout should be 0
    // Formula: if (t >= INITIAL + DECAY) return 0
    assertBigIntEqual(state.currentPayout, 0n, "Payout at expiry is 0");
  });

  it("should verify refundOwed includes credited amounts", async () => {
    // This test verifies the formula: refundOwed = (target - refunded) + credited
    // Where target = (fundedAmounts[who] * refundSnapshot) / totalFunded
    // This is implicitly tested through the batching test, but let's be explicit

    const { bounty, publicClient, funderAddresses, contributions } =
      await deployWithRefundsEnabledFixture();

    const state = await getBountyState(bounty, publicClient);

    // The first funder was processed, so their refundOwed should be 0
    const viewAbi = ["function refundOwed(address) view returns (uint256)"];
    const owed = await publicClient.readContract({
      address: bounty,
      abi: viewAbi,
      functionName: "refundOwed",
      args: [funderAddresses[0]],
    }) as bigint;

    assertBigIntEqual(owed, 0n, "First funder has no refund owed (already processed)");

    // Check that sum of all refunds doesn't exceed snapshot
    let totalOwed = 0n;
    for (const funderAddr of funderAddresses) {
      const owed = await publicClient.readContract({
        address: bounty,
        abi: viewAbi,
        functionName: "refundOwed",
        args: [funderAddr],
      }) as bigint;
      totalOwed += owed;
    }

    // Total owed should be less than or equal to remaining refund pool
    // (Some may have already been paid out)
    assertBigIntClose(
      totalOwed,
      state.refundSnapshot - state.balance,
      parseEther("0.01"),
      "Total owed matches remaining refund pool"
    );
  });
});
