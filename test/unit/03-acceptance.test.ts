import { describe, it } from "node:test";
import { EXPLOITER, KNINE, TEST_FUNDERS } from "../shared/constants.js";
import { deployWithOneFunderFixture, deployWithAcceptanceFixture } from "../shared/fixtures.js";
import { assertReverts, assertTrue } from "../shared/assertions.js";
import { callAs, ERC20_ABI } from "../shared/helpers.js";
import { parseEther, parseAbi } from "viem";

describe("03 - Acceptance Validation", () => {
  // NOTE: Hardhat 3.x auto-resets chain between tests with node:test runner
  // No manual beforeEach reset needed

  it("should reject accept() when called by non-exploiter", async () => {
    const { bounty, publicClient } = await deployWithOneFunderFixture();

    // Approve KNINE from EXPLOITER (so the only failure is authorization)
    await callAs(
      EXPLOITER,
      KNINE,
      ERC20_ABI,
      "approve",
      [bounty, parseEther("250000000000")]
    );

    // Try to call accept() from TEST_FUNDERS[0]
    const acceptAbi = parseAbi(["function accept()"]);
    await assertReverts(
      publicClient.writeContract({
        address: bounty,
        abi: acceptAbi,
        functionName: "accept",
        account: TEST_FUNDERS[0],
      }),
      "ONLY_EXPLOITER",
      {
        operation: "Accept from non-exploiter",
        details: `${TEST_FUNDERS[0]} tried to call accept() instead of exploiter`,
      }
    );
  });

  it("should reject double accept()", async () => {
    const { bounty } = await deployWithAcceptanceFixture();

    // Try to call accept() again from EXPLOITER
    const acceptAbi = parseAbi(["function accept()"]);
    await assertReverts(
      callAs(EXPLOITER, bounty, acceptAbi, "accept"),
      "ACK",
      {
        operation: "Double accept",
        details: "Contract should reject accept() when already accepted",
      }
    );
  });
});
