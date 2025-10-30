import { describe, it } from "node:test";
import { EXPLOITER, KNINE } from "../shared/constants.js";
import { deployExpiredFixture } from "../shared/fixtures.js";
import { assertReverts } from "../shared/assertions.js";
import { callAs, ERC20_ABI } from "../shared/helpers.js";
import { parseEther, parseAbi } from "viem";

describe("04 - Recovery Validation", () => {
  // NOTE: Hardhat 3.x auto-resets chain between tests with node:test runner
  // No manual beforeEach reset needed

  it("should revert recoverKnine() after full expiry with EXPIRED", async () => {
    const { bounty, publicClient } = await deployExpiredFixture();

    // Approve KNINE from EXPLOITER to bounty
    await callAs(EXPLOITER, KNINE, ERC20_ABI, "approve", [bounty, parseEther("250000000000")]);

    // Try to recover after expiry
    const recoverAbi = parseAbi(["function recoverKnine()"]);
    await assertReverts(
      publicClient.writeContract({
        address: bounty,
        abi: recoverAbi,
        functionName: "recoverKnine",
        account: EXPLOITER,
      }),
      "EXPIRED",
      { operation: "recoverKnine after expiry" }
    );
  });
});
