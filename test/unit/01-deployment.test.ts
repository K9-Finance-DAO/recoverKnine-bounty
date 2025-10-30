import { describe, it } from "node:test";
import { parseAbi } from "viem";
import { TEST_INITIAL_PERIOD, TEST_DECAY_PERIOD, TEST_TERMS_HASH } from "../shared/constants.js";
import { deployBountyFixture, getBountyState } from "../shared/fixtures.js";
import { assertBigIntEqual, assertTrue, assertFalse } from "../shared/assertions.js";
import { getNowTs } from "../shared/helpers.js";

describe("01 - Deployment", () => {
  // NOTE: Hardhat 3.x auto-resets chain between tests with node:test runner
  // No manual beforeEach reset needed

  it("should deploy with correct immutables (START, INITIAL, DECAY, TERMS_HASH)", async () => {
    const { bounty, publicClient, start, initial, decay } = await deployBountyFixture();

    // ABI for reading immutable values
    const IMMUTABLES_ABI = parseAbi([
      "function START() view returns (uint256)",
      "function INITIAL() view returns (uint256)",
      "function DECAY() view returns (uint256)",
      "function TERMS_HASH() view returns (bytes32)",
    ]);

    // Read immutables
    const actualStart = await publicClient.readContract({
      address: bounty,
      abi: IMMUTABLES_ABI,
      functionName: "START",
    }) as bigint;

    const actualInitial = await publicClient.readContract({
      address: bounty,
      abi: IMMUTABLES_ABI,
      functionName: "INITIAL",
    }) as bigint;

    const actualDecay = await publicClient.readContract({
      address: bounty,
      abi: IMMUTABLES_ABI,
      functionName: "DECAY",
    }) as bigint;

    const actualTermsHash = await publicClient.readContract({
      address: bounty,
      abi: IMMUTABLES_ABI,
      functionName: "TERMS_HASH",
    }) as string;

    // Assert they match constructor args
    assertBigIntEqual(actualInitial, TEST_INITIAL_PERIOD, "INITIAL period");
    assertBigIntEqual(actualDecay, TEST_DECAY_PERIOD, "DECAY period");

    if (actualTermsHash !== TEST_TERMS_HASH) {
      throw new Error(`TERMS_HASH mismatch: expected ${TEST_TERMS_HASH}, got ${actualTermsHash}`);
    }

    // Assert START is recent (within 10s of now)
    const now = await getNowTs();
    const timeDiff = now > actualStart ? now - actualStart : actualStart - now;

    if (timeDiff > 10n) {
      throw new Error(`START timestamp too far from current time: ${timeDiff}s difference`);
    }

    // Also verify START matches what deployBountyFixture returned
    assertBigIntEqual(actualStart, start, "START timestamp");
  });

  it("should initialize with correct state (not finalized, no acceptance, no refunds)", async () => {
    const { bounty, publicClient } = await deployBountyFixture();

    // Use getBountyState() helper
    const state = await getBountyState(bounty, publicClient);

    // Assert acceptedAt === 0
    assertBigIntEqual(state.acceptedAt, 0n, "acceptedAt should be 0");

    // Assert finalized === false
    assertFalse(state.finalized, "Contract should not be finalized");

    // Assert refundsEnabled === false
    assertFalse(state.refundsEnabled, "Refunds should not be enabled");

    // Assert totalFunded === 0
    assertBigIntEqual(state.totalFunded, 0n, "totalFunded should be 0");

    // Assert balance === 0
    assertBigIntEqual(state.balance, 0n, "Contract balance should be 0");
  });
});
