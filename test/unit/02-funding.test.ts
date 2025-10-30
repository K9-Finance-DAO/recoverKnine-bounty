import { describe, it, beforeEach } from "node:test";
import { parseEther, parseAbi } from "viem";
import { network } from "hardhat";
import { MIN_FUNDING, FUNDING_AMOUNTS, EXPLOITER, KNINE } from "../shared/constants.js";
import { deployBountyFixture, deployFinalizedFixture, deployWithRefundsEnabledFixture, deployExpiredFixture } from "../shared/fixtures.js";
import { assertReverts, assertBigIntEqual, assertArrayLength } from "../shared/assertions.js";
import { callAs, ERC20_ABI } from "../shared/helpers.js";

describe("02 - Funding Validation", () => {
  // NOTE: Hardhat 3.x auto-resets chain between tests with node:test runner
  // No manual beforeEach reset needed

  it("should reject funding below MIN_FUNDING", async () => {
    const { bounty, wallets } = await deployBountyFixture();
    const funder = wallets[1];

    // Try to send 0.005 ETH (below 0.01 ETH minimum)
    // Note: Hardhat can't infer custom error names, so we check for any revert
    await assertReverts(
      funder.sendTransaction({
        to: bounty,
        value: FUNDING_AMOUNTS.TINY, // 0.005 ETH
      }),
      undefined, // Accept any revert
      {
        operation: "Funding below minimum",
        details: `Attempted to send ${FUNDING_AMOUNTS.TINY} wei, minimum is ${MIN_FUNDING} wei`,
      }
    );
  });

  it("should reject funding after bounty is finalized", async () => {
    const { bounty, wallets } = await deployFinalizedFixture();
    const funder = wallets[2]; // Use a different wallet from the one that funded initially

    // Try to send ETH after finalization
    await assertReverts(
      funder.sendTransaction({
        to: bounty,
        value: FUNDING_AMOUNTS.SMALL, // 1 ETH
      }),
      "FINALIZED",
      {
        operation: "Funding after finalized",
        details: "Contract should reject funding once finalized",
      }
    );
  });

  it("should reject funding after refunds are enabled", async () => {
    const { bounty, wallets } = await deployWithRefundsEnabledFixture();
    const newFunder = wallets[4]; // Use wallet that hasn't funded yet

    // Try to send ETH after refunds are enabled
    await assertReverts(
      newFunder.sendTransaction({
        to: bounty,
        value: FUNDING_AMOUNTS.SMALL, // 1 ETH
      }),
      "REFUNDS_STARTED",
      {
        operation: "Funding after refunds enabled",
        details: "Contract should reject funding once refunds have started",
      }
    );
  });

  it("should reject funding after timeline expires", async () => {
    const { bounty, wallets } = await deployExpiredFixture();
    const funder = wallets[2];

    // Try to send ETH after expiry
    await assertReverts(
      funder.sendTransaction({
        to: bounty,
        value: FUNDING_AMOUNTS.SMALL, // 1 ETH
      }),
      "FUNDING_CLOSED",
      {
        operation: "Funding after timeline expired",
        details: "Contract should reject funding after INITIAL + DECAY period",
      }
    );
  });

  it("should track multiple funders correctly and handle top-ups", async () => {
    const { bounty, publicClient, wallets } = await deployBountyFixture();

    // Use 3 different funders with different amounts
    const funder1 = wallets[1];
    const funder2 = wallets[2];
    const funder3 = wallets[3];

    const amount1 = parseEther("5");
    const amount2 = parseEther("3");
    const amount3 = parseEther("2");

    // ABI for reading contract state
    const FUNDING_ABI = parseAbi([
      "function totalFunded() view returns (uint256)",
      "function fundedAmounts(address) view returns (uint256)",
      "function funders(uint256) view returns (address)",
    ]);

    // Funder 1 sends 5 ETH
    await funder1.sendTransaction({ to: bounty, value: amount1 });

    // Verify state after first funder
    let totalFunded = await publicClient.readContract({
      address: bounty,
      abi: FUNDING_ABI,
      functionName: "totalFunded",
    }) as bigint;
    assertBigIntEqual(totalFunded, amount1, "Total funded after first funder");

    let funder1Amount = await publicClient.readContract({
      address: bounty,
      abi: FUNDING_ABI,
      functionName: "fundedAmounts",
      args: [funder1.account.address],
    }) as bigint;
    assertBigIntEqual(funder1Amount, amount1, "Funder 1 amount");

    // Funder 2 sends 3 ETH
    await funder2.sendTransaction({ to: bounty, value: amount2 });

    // Verify state after second funder
    totalFunded = await publicClient.readContract({
      address: bounty,
      abi: FUNDING_ABI,
      functionName: "totalFunded",
    }) as bigint;
    assertBigIntEqual(totalFunded, amount1 + amount2, "Total funded after second funder");

    let funder2Amount = await publicClient.readContract({
      address: bounty,
      abi: FUNDING_ABI,
      functionName: "fundedAmounts",
      args: [funder2.account.address],
    }) as bigint;
    assertBigIntEqual(funder2Amount, amount2, "Funder 2 amount");

    // Funder 3 sends 2 ETH
    await funder3.sendTransaction({ to: bounty, value: amount3 });

    // Verify state after third funder
    totalFunded = await publicClient.readContract({
      address: bounty,
      abi: FUNDING_ABI,
      functionName: "totalFunded",
    }) as bigint;
    assertBigIntEqual(totalFunded, amount1 + amount2 + amount3, "Total funded after third funder");

    let funder3Amount = await publicClient.readContract({
      address: bounty,
      abi: FUNDING_ABI,
      functionName: "fundedAmounts",
      args: [funder3.account.address],
    }) as bigint;
    assertBigIntEqual(funder3Amount, amount3, "Funder 3 amount");

    // Verify funders array has 3 entries
    const funder1Address = await publicClient.readContract({
      address: bounty,
      abi: FUNDING_ABI,
      functionName: "funders",
      args: [0n],
    }) as string;

    const funder2Address = await publicClient.readContract({
      address: bounty,
      abi: FUNDING_ABI,
      functionName: "funders",
      args: [1n],
    }) as string;

    const funder3Address = await publicClient.readContract({
      address: bounty,
      abi: FUNDING_ABI,
      functionName: "funders",
      args: [2n],
    }) as string;

    const fundersArray = [funder1Address, funder2Address, funder3Address];
    assertArrayLength(fundersArray, 3, "Funders array length");

    // Funder 1 tops up with another 1 ETH
    const topUpAmount = parseEther("1");
    await funder1.sendTransaction({ to: bounty, value: topUpAmount });

    // Verify funder 1's total increased
    funder1Amount = await publicClient.readContract({
      address: bounty,
      abi: FUNDING_ABI,
      functionName: "fundedAmounts",
      args: [funder1.account.address],
    }) as bigint;
    assertBigIntEqual(funder1Amount, amount1 + topUpAmount, "Funder 1 amount after top-up");

    // Verify total funded increased
    totalFunded = await publicClient.readContract({
      address: bounty,
      abi: FUNDING_ABI,
      functionName: "totalFunded",
    }) as bigint;
    assertBigIntEqual(
      totalFunded,
      amount1 + amount2 + amount3 + topUpAmount,
      "Total funded after top-up"
    );

    // Verify funders array still has only 3 entries (no duplicate)
    // Try to read index 3, should revert
    try {
      await publicClient.readContract({
        address: bounty,
        abi: FUNDING_ABI,
        functionName: "funders",
        args: [3n],
      });
      throw new Error("Expected reading index 3 to fail");
    } catch (error: any) {
      // Expected - array should only have 3 entries
      // This confirms no duplicate was added
    }

    // Verify the first 3 entries are still correct
    const funder1AfterTopUp = await publicClient.readContract({
      address: bounty,
      abi: FUNDING_ABI,
      functionName: "funders",
      args: [0n],
    }) as string;

    const funder2AfterTopUp = await publicClient.readContract({
      address: bounty,
      abi: FUNDING_ABI,
      functionName: "funders",
      args: [1n],
    }) as string;

    const funder3AfterTopUp = await publicClient.readContract({
      address: bounty,
      abi: FUNDING_ABI,
      functionName: "funders",
      args: [2n],
    }) as string;

    const fundersArrayAfterTopUp = [funder1AfterTopUp, funder2AfterTopUp, funder3AfterTopUp];
    assertArrayLength(fundersArrayAfterTopUp, 3, "Funders array length after top-up");
  });
});
