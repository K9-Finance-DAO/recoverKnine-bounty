# Comprehensive Test Coverage Implementation Plan
## KnineRecoveryBountyDecayAcceptMultiFunder Contract

**Date:** 2025-10-30
**Status:** In Progress (30% complete)
**Target:** 97%+ test coverage across all contract functions

---

## 📋 TABLE OF CONTENTS

1. [Project Context](#project-context)
2. [Current State Assessment](#current-state-assessment)
3. [Architecture & Design Decisions](#architecture--design-decisions)
4. [Detailed Implementation Plan](#detailed-implementation-plan)
5. [Agent Task Specifications](#agent-task-specifications)
6. [Success Criteria](#success-criteria)
7. [Appendix: Reference Materials](#appendix-reference-materials)

---

## 🎯 PROJECT CONTEXT

### What We're Building

We are implementing a comprehensive test suite for the `KnineRecoveryBountyDecayAcceptMultiFunder` smart contract, which is a bounty contract with the following functionality:

**Contract Purpose:**
- Allows community members to pool ETH as a bounty for the return of 248.9894B KNINE tokens
- Exploiter can accept the bounty to freeze the payout percentage at a specific time
- Payout decays linearly over a 7-day period after an initial 22-day window
- Upon successful KNINE recovery, remaining ETH is refunded pro-rata to all funders
- Supports multiple funders with batched refund distribution

**Key Contract Features:**
1. **Multi-Funder Support**: Anyone can contribute ETH (min 0.01 ETH) to increase bounty
2. **Time-Based Decay**: Payout starts at 100%, decays linearly to 0% over DECAY period
3. **Acceptance Freeze**: Exploiter can freeze payout percentage by calling `accept()`
4. **Pro-Rata Refunds**: Unused ETH distributed proportionally to funders
5. **Batched Refunds**: Gas-efficient refund distribution with pull-based fallback
6. **Security**: Reentrancy guards, blacklist handling, safe ETH transfers

### Why This Matters

**Critical for Production Deployment:**
- This contract will handle real ETH and token transfers
- Security vulnerabilities could result in loss of funds
- Edge cases must be handled correctly (refund calculations, timing boundaries)
- Multi-funder accounting must be precise (no rounding errors causing stuck funds)

**Comprehensive Testing Requirements:**
- **23 missing test cases** identified from test-plan.md gap analysis
- **97%+ code coverage** target (statements, branches, functions, lines)
- **Security-critical paths** (reentrancy, forced ETH, authorization)
- **Edge cases** (zero funders, post-finalized operations, boundary conditions)
- **View functions** (user-facing helpers for frontend/monitoring)

### Current Test Coverage Gap Analysis

According to `test-plan.md`, we need to cover:

**Test Suite Breakdown (38 total cases):**
- Suite 0: Deployment & Invariants (2 cases)
- Suite 1: Funding & Accounting (6 cases)
- Suite 2: Acceptance & Freeze (6 cases)
- Suite 3: Recovery Flows (7 cases)
- Suite 4: Refund Enablement (4 cases)
- Suite 5: Refund Distribution (8 cases)
- Suite 6: View Helpers (3 cases)
- Suite 7: Security & Edge Cases (4 cases)

**Currently Covered:** 17/38 cases (~45%)
- Interactive script (`scripts/interactive-bounty-v2.ts`) covers main scenarios S1-S8
- Existing unit test (`test/KnineRecoveryBountyDecayAccept.ts`) covers old contract version
- **Gap:** 23 test cases need explicit unit/integration tests

---

## 📊 CURRENT STATE ASSESSMENT

### ✅ Completed Work

#### 1. Shared Test Utilities (100% Complete)

**Location:** `test/shared/`

**Files:**
- **`constants.ts`** (60 lines)
  - All contract addresses (KNINE, EXPLOITER, K9SAFE, SHIBARIUM_BRIDGE)
  - Test configuration (periods, amounts, terms hash)
  - Helper constants (MIN_FUNDING, test funder addresses)
  - Environment flags (VERBOSE, REPORT_GAS)

- **`helpers.ts`** (282 lines)
  - Time manipulation: `increaseTime()`, `getNowTs()`, `setNextTimestamp()`
  - Account impersonation: `impersonate()`, `setBalance()`, `impersonateAndFund()`
  - Balance tracking: `captureBalances()`, `getBalanceDelta()`
  - Contract calls: `callAs()` (simplified RPC wrapper)
  - Mock KNINE setup: `setupMockKnine()` (handles fork vs local)
  - Calculations: `calculatePayout()`, `calculateProRataRefund()`
  - Formatting: Color logging, address shortening, ETH formatting
  - Snapshot management: `takeSnapshot()`, `revertToSnapshot()`

- **`fixtures.ts`** (280 lines)
  - `deployBountyFixture()`: Base deployment
  - `deployWithOneFunderFixture()`: Single funder scenario
  - `deployWithMultiFundersFixture()`: 1-5 funders with configurable amounts
  - `deployWithAcceptanceFixture()`: With exploiter acceptance at specific time
  - `deployWithMidDecayAcceptanceFixture()`: Accept during decay period
  - `deployFinalizedFixture()`: After recovery completed
  - `deployExpiredFixture()`: Past INITIAL + DECAY deadline
  - `deployWithRefundsEnabledFixture()`: Refunds triggered
  - `getBountyState()`: Read all contract state in one call

- **`assertions.ts`** (340 lines)
  - Numeric: `assertBigIntEqual()`, `assertBigIntClose()`, `assertGreaterThan()`
  - Boolean: `assertTrue()`, `assertFalse()`
  - Balance: `assertBalanceEqual()`, `assertBalanceDelta()`
  - Revert: `assertReverts()` (extracts error messages)
  - Events: `assertEventEmitted()`, `assertEventCount()`
  - Arrays: `assertArrayLength()`
  - State: `assertContractState()`, `assertStateChange()`
  - **All assertions include verbose logging with colors**

#### 2. Unit Tests (2/9 Complete - 22%)

**`test/unit/02-funding.test.ts`** (252 lines, 5 tests)
- ✅ F1.2: Reject funding < MIN_FUNDING (0.01 ETH)
- ✅ F1.3: Reject funding after bounty finalized
- ✅ F1.4: Reject funding after refunds enabled
- ✅ F1.5: Reject funding after timeline expired
- ✅ F1.6: Multi-funder tracking + top-ups (no duplicate in funders array)

**`test/unit/07-views.test.ts`** (341 lines, 12 tests)
- ✅ V6.1: `timeRemaining()` monotonic decrease, zero at expiry
- ✅ V6.2: `currentPayout()` calculations across timeline
- ✅ V6.2b: `currentPayout()` freezes at acceptance time
- ✅ V6.2c: `currentPayout()` with frozen percentage on balance changes
- ✅ V6.3: `refundOwed()` with and without batching
- ✅ V6.3b: `refundOwed()` includes credited amounts
- ✅ Edge: zero balance, zero funders, exact boundaries (INITIAL, INITIAL+DECAY)

#### 3. Configuration

**`hardhat.config.ts`**
- ✅ Added `hardhatMainnet` forking config (Alchemy RPC URL)
- ✅ Added `localhost` network (http://127.0.0.1:8545)
- Note: Forking URL hardcoded - should use env var for production

### ❌ Missing Work

#### Missing Unit Tests (7/9 files)

1. **`01-deployment.test.ts`** - Deployment & Invariants
   - D0.1: Verify immutables (START, INITIAL, DECAY, TERMS_HASH)
   - D0.2: Verify initial state (acceptedAt=0, finalized=false, etc.)

2. **`03-acceptance.test.ts`** - Acceptance Authorization & State
   - A2.1: Only EXPLOITER can call accept() (non-exploiter → ONLY_EXPLOITER)
   - A2.6: Double accept prevention (acceptedAt != 0 → ACK)

3. **`04-recovery.test.ts`** - Recovery Edge Cases
   - R3.6: Recovery after DECAY expiry without acceptance → EXPIRED

4. **`05-refunds-enable.test.ts`** - Refund Enablement Guards
   - E4.3: LOCKED_OR_EARLY guard (can't enable if acceptance valid)
   - E4.4: Re-enable idempotency (already enabled → no-op)

5. **`06-refunds-distrib.test.ts`** - Refund Distribution Mechanics
   - P5.2: `refundAllEth()` function (convenience wrapper)
   - P5.4: Funder self-claims before batch (batch becomes no-op)
   - P5.6: `refundBatch` with zero funders → NO_FUNDERS
   - P5.8: Forced ETH after snapshot (dust remains, snapshot unchanged)

6. **`08-security.test.ts`** - Security & Attack Vectors
   - N7.1: Reentrancy protection (attempt reentry → REENTRANCY)
   - N7.2: Forced ETH via selfdestruct helper (doesn't break refunds)
   - N7.3: Operations after finalized → FINALIZED

7. **`09-edge-cases.test.ts`** - Additional Edge Cases
   - Batch size validations
   - State transitions
   - Boundary conditions not covered elsewhere

#### Missing Integration Tests (2 files)

8. **`integration/scenarios-s1-s4.test.ts`** - Happy Paths
   - S1: Single funder, no accept, recover during INITIAL (full payout)
   - S2: Two funders, accept in INITIAL, top-up after (frozen ratio scales)
   - S3: Accept mid-DECAY, extra funding, delayed recovery (partial payout)
   - S4: Five funders, live decay recovery, batched refunds (gas testing)

9. **`integration/scenarios-s5-s8.test.ts`** - Edge/Negative Cases
   - S5: Expiry refunds without recovery (manual trigger)
   - S6: Acceptance after expiry → TOO_LATE
   - S7: Recovery without unblacklisting → TRANSFER_FAIL
   - S8: Refund push failure → pull claim (malicious receiver contract)

#### Missing Configuration

10. **Coverage Setup**
    - Install `solidity-coverage` plugin
    - Configure coverage in `hardhat.config.ts`
    - Set thresholds (95% statements, 90% branches, 100% functions)

11. **NPM Scripts** (package.json)
    ```json
    {
      "test": "hardhat test",
      "test:unit": "hardhat test test/unit/**/*.test.ts",
      "test:integration": "hardhat test test/integration/**/*.test.ts",
      "test:verbose": "VERBOSE=1 hardhat test",
      "test:gas": "REPORT_GAS=1 hardhat test",
      "coverage": "hardhat coverage",
      "coverage:report": "hardhat coverage && open coverage/index.html"
    }
    ```

---

## 🏗️ ARCHITECTURE & DESIGN DECISIONS

### Why This Architecture?

#### 1. Shared Utilities Pattern

**Decision:** Create reusable `test/shared/` modules for all tests

**Rationale:**
- **DRY Principle**: Avoid duplicating setup code across 11+ test files
- **Consistency**: All tests use same helpers → predictable behavior
- **Maintainability**: Fix bugs in one place, not scattered across files
- **Parallel Safety**: Immutable shared code prevents agent conflicts

**Pattern:**
```
test/
├── shared/           # Immutable foundation (agents do NOT modify)
│   ├── constants.ts  # Single source of truth for addresses/amounts
│   ├── helpers.ts    # Time travel, impersonation, calculations
│   ├── fixtures.ts   # Standardized deployment scenarios
│   └── assertions.ts # Verbose, colored output for debugging
│
├── unit/             # Fast, focused tests (agents create these)
│   ├── 01-deployment.test.ts
│   ├── 02-funding.test.ts  ✅ DONE
│   ├── 03-acceptance.test.ts
│   └── ...
│
└── integration/      # Multi-step flows (agents create these)
    ├── scenarios-s1-s4.test.ts
    └── scenarios-s5-s8.test.ts
```

#### 2. Fixture-Based Testing

**Decision:** Use fixtures for all test deployments

**Rationale:**
- **Speed**: Snapshot-based resets faster than full redeployment
- **Reproducibility**: Same initial state for all tests
- **Composability**: `deployWithOneFunderFixture()` builds on `deployBountyFixture()`
- **Clarity**: Test intent clear from fixture name

**Example:**
```typescript
// Bad: Manual setup repeated in every test
it("test", async () => {
  await network.provider.request({ method: "hardhat_reset" });
  await setupMockKnine();
  const { viem } = await network.connect();
  const bounty = await viem.deployContract(...);
  // ... 20 more lines of setup
});

// Good: Fixture encapsulates setup
it("test", async () => {
  const { bounty, publicClient, wallets } = await deployBountyFixture();
  // Test starts immediately
});
```

#### 3. Verbose Assertions

**Decision:** Custom assertions with detailed logging

**Rationale:**
- **Debugging**: Immediately see expected vs actual without re-running
- **CI/CD**: Logs provide context when tests fail in automation
- **Onboarding**: New devs understand what tests check

**Example Output:**
```
✓ Total funded after second funder: 8000000000000000000 (exact match)
✗ Payout at mid-DECAY
  Expected: 5000000000000000000 (5.0 ETH)
  Actual:   4999000000000000000 (4.999 ETH)
  Diff:     1000000000000000 (0.001 ETH)
```

#### 4. Test Isolation Strategy

**Decision:** Hardhat 3.x native test runner with auto-reset

**Rationale:**
- **Isolation**: Each test starts with clean chain state
- **Speed**: Native runner faster than external test frameworks
- **Simplicity**: No manual `beforeEach` chain resets needed
- **TypeScript**: First-class support, no transpilation issues

**Note:** Hardhat 3.x + `node:test` automatically resets chain between tests

#### 5. Parallel Agent Strategy

**Decision:** Wave-based parallel agent deployment

**Rationale:**
- **Speed**: 7 agents in parallel = ~7x faster than sequential
- **Safety**: Shared utilities immutable → no merge conflicts
- **Incremental**: Validate unit tests before integration tests
- **Clarity**: Each agent owns one file → clear responsibilities

**Wave Structure:**
```
Wave 0: Foundation (DONE)
├── shared/* (4 files, manually created)

Wave 1: Unit Tests (7 agents in parallel)
├── Agent 1 → 01-deployment.test.ts
├── Agent 2 → 03-acceptance.test.ts
├── Agent 3 → 04-recovery.test.ts
├── Agent 4 → 05-refunds-enable.test.ts
├── Agent 5 → 06-refunds-distrib.test.ts
├── Agent 6 → 08-security.test.ts
└── Agent 7 → 09-edge-cases.test.ts

Wave 2: Integration Tests (2 agents in parallel)
├── Agent 8 → scenarios-s1-s4.test.ts
└── Agent 9 → scenarios-s5-s8.test.ts

Wave 3: Configuration (sequential)
└── Coverage setup + NPM scripts
```

---

## 📝 DETAILED IMPLEMENTATION PLAN

### Phase 1: Unit Test Implementation (Wave 1)

**Objective:** Create 7 missing unit test files covering 16 test cases

**Approach:** Launch 7 agents in parallel, each responsible for one test file

**Dependencies:**
- ✅ `test/shared/*` must be complete (DONE)
- ✅ Template examples available (`02-funding.test.ts`, `07-views.test.ts`)

**Success Criteria:**
- All 7 files created without errors
- Each test uses shared utilities correctly
- Tests follow naming convention: `"should [expected behavior] when [condition]"`
- All tests pass on first run (or fail with clear error messages)

#### Agent 1: 01-deployment.test.ts

**Test Cases:** 2

**Test D0.1: Verify Immutables**
```typescript
it("should set immutables correctly on deployment", async () => {
  const { bounty, publicClient, start, initial, decay } = await deployBountyFixture();

  // Read TERMS_HASH from contract
  const termsHash = await publicClient.readContract({
    address: bounty,
    abi: ["function TERMS_HASH() view returns (bytes32)"],
    functionName: "TERMS_HASH",
  });

  assertBigIntEqual(initial, TEST_INITIAL_PERIOD, "INITIAL period");
  assertBigIntEqual(decay, TEST_DECAY_PERIOD, "DECAY period");
  assertEquals(termsHash, TEST_TERMS_HASH, "TERMS_HASH");
  // START should be approximately current block timestamp
  const now = await getNowTs();
  assertBigIntClose(start, now, 5n, "START timestamp");
});
```

**Test D0.2: Verify Initial State**
```typescript
it("should initialize state variables to zero", async () => {
  const { bounty, publicClient } = await deployBountyFixture();
  const state = await getBountyState(bounty, publicClient);

  assertBigIntEqual(state.acceptedAt, 0n, "acceptedAt should be 0");
  assertFalse(state.finalized, "finalized should be false");
  assertFalse(state.refundsEnabled, "refundsEnabled should be false");
  assertBigIntEqual(state.refundSnapshot, 0n, "refundSnapshot should be 0");
  assertBigIntEqual(state.refundCursor, 0n, "refundCursor should be 0");
  assertBigIntEqual(state.totalFunded, 0n, "totalFunded should be 0");
});
```

#### Agent 2: 03-acceptance.test.ts

**Test Cases:** 2

**Test A2.1: Authorization Check**
```typescript
it("should revert when non-exploiter calls accept()", async () => {
  const { bounty, publicClient, wallets } = await deployWithOneFunderFixture();

  // Setup: Give exploiter approval
  await callAs(EXPLOITER, KNINE, ERC20_ABI, "approve", [bounty, AMOUNT]);

  // Try to accept from non-exploiter wallet
  await assertReverts(
    publicClient.writeContract({
      address: bounty,
      abi: ["function accept()"],
      functionName: "accept",
      account: wallets[1].account,
    }),
    "ONLY_EXPLOITER",
    {
      operation: "Non-exploiter calling accept()",
      details: "Only EXPLOITER address should be authorized",
    }
  );
});
```

**Test A2.6: Double Accept Prevention**
```typescript
it("should revert when accept() called twice", async () => {
  const { bounty, publicClient } = await deployWithAcceptanceFixture();

  // acceptedAt is now non-zero (already accepted in fixture)
  const state = await getBountyState(bounty, publicClient);
  assertTrue(state.acceptedAt > 0n, "Should already be accepted");

  // Try to accept again
  await assertReverts(
    publicClient.writeContract({
      address: bounty,
      abi: ["function accept()"],
      functionName: "accept",
      account: EXPLOITER,
    }),
    "ACK",
    {
      operation: "Double accept",
      details: "Second accept() call should be rejected",
    }
  );
});
```

#### Agent 3: 04-recovery.test.ts

**Test Cases:** 1

**Test R3.6: Recovery After Expiry**
```typescript
it("should revert recovery after DECAY period expires without acceptance", async () => {
  const { bounty, publicClient, initial, decay } = await deployWithOneFunderFixture();

  // Approve KNINE
  await callAs(EXPLOITER, KNINE, ERC20_ABI, "approve", [bounty, AMOUNT]);

  // Advance past expiry (INITIAL + DECAY + 1)
  await increaseTime(initial + decay + 1n);

  // Verify currentPayout is 0
  const state = await getBountyState(bounty, publicClient);
  assertBigIntEqual(state.currentPayout, 0n, "Payout should be 0 after expiry");

  // Try to recover
  await assertReverts(
    publicClient.writeContract({
      address: bounty,
      abi: ["function recoverKnine()"],
      functionName: "recoverKnine",
      account: EXPLOITER,
    }),
    "EXPIRED",
    {
      operation: "Recovery after expiry",
      details: "recoverKnine() should reject when payout is 0",
    }
  );
});
```

#### Agent 4: 05-refunds-enable.test.ts

**Test Cases:** 2

**Test E4.3: LOCKED_OR_EARLY Guard**
```typescript
it("should prevent refund enablement when acceptance is still valid", async () => {
  const { bounty, publicClient, initial, decay } = await deployWithAcceptanceFixture();

  // Exploiter has accepted and still has allowance + balance
  // Advance past expiry
  await increaseTime(initial + decay + 1n);

  // Verify acceptance is still valid (allowance + balance intact)
  const allowance = await publicClient.readContract({
    address: KNINE,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [EXPLOITER, bounty],
  });
  const balance = await publicClient.readContract({
    address: KNINE,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [EXPLOITER],
  });
  assertTrue(allowance >= AMOUNT, "Allowance still valid");
  assertTrue(balance >= AMOUNT, "Balance still valid");

  // Try to enable refunds via refundBatch
  await assertReverts(
    publicClient.writeContract({
      address: bounty,
      abi: ["function refundBatch(uint256)"],
      functionName: "refundBatch",
      args: [1n],
    }),
    "LOCKED_OR_EARLY",
    {
      operation: "Enable refunds with valid acceptance",
      details: "Cannot renege while exploiter can still fulfill",
    }
  );
});
```

**Test E4.4: Re-enable Idempotency**
```typescript
it("should be idempotent when refunds already enabled", async () => {
  const { bounty, publicClient } = await deployWithRefundsEnabledFixture();

  // Refunds already enabled
  const state1 = await getBountyState(bounty, publicClient);
  assertTrue(state1.refundsEnabled, "Refunds should be enabled");
  const snapshot1 = state1.refundSnapshot;
  const cursor1 = state1.refundCursor;

  // Call refundBatch again (will attempt to re-enable)
  await publicClient.writeContract({
    address: bounty,
    abi: ["function refundBatch(uint256)"],
    functionName: "refundBatch",
    args: [1n],
  });

  // State should be unchanged (idempotent)
  const state2 = await getBountyState(bounty, publicClient);
  assertBigIntEqual(state2.refundSnapshot, snapshot1, "Snapshot unchanged");
  // Cursor may advance, but snapshot should not change
});
```

#### Agent 5: 06-refunds-distrib.test.ts

**Test Cases:** 4

**Test P5.2: refundAllEth() Function**
```typescript
it("should refund all funders via refundAllEth()", async () => {
  const { bounty, publicClient, funderAddresses } = await deployWithRefundsEnabledFixture();

  // Get initial balances
  const balancesBefore = await captureBalances(funderAddresses);

  // Call refundAllEth()
  await publicClient.writeContract({
    address: bounty,
    abi: ["function refundAllEth()"],
    functionName: "refundAllEth",
  });

  // Verify all funders received refunds
  const balancesAfter = await captureBalances(funderAddresses);
  const state = await getBountyState(bounty, publicClient);

  for (const addr of funderAddresses) {
    const delta = getBalanceDelta(balancesBefore, balancesAfter, addr);
    assertTrue(delta > 0n, `${formatAddress(addr)} received refund`);
  }

  // Verify cursor advanced to end
  assertBigIntEqual(state.refundCursor, BigInt(funderAddresses.length), "Cursor at end");
});
```

**Test P5.4: Self-Claim Before Batch**
```typescript
it("should handle self-claim before batch processes funder", async () => {
  const { bounty, publicClient, funderAddresses } = await deployWithRefundsEnabledFixture();

  // First funder already processed in fixture
  // Second funder claims manually before batch reaches them
  const funderB = funderAddresses[1];
  const balanceBefore = await publicClient.getBalance({ address: funderB });

  // Self-claim
  await publicClient.writeContract({
    address: bounty,
    abi: ["function claimRefund()"],
    functionName: "claimRefund",
    account: funderB,
  });

  const balanceAfter = await publicClient.getBalance({ address: funderB });
  const delta = balanceAfter - balanceBefore;
  assertTrue(delta > 0n, "Funder B received refund via claim");

  // Now run batch to process funder B
  await publicClient.writeContract({
    address: bounty,
    abi: ["function refundBatch(uint256)"],
    functionName: "refundBatch",
    args: [1n],
  });

  // Verify funder B doesn't get paid twice (batch is no-op for them)
  const balanceFinal = await publicClient.getBalance({ address: funderB });
  // Balance should be same or slightly lower (gas), not higher
  assertTrue(balanceFinal <= balanceAfter, "No double payment");
});
```

**Test P5.6: Zero Funders Revert**
```typescript
it("should revert refundBatch when no funders exist", async () => {
  // Deploy without any funding
  const { bounty, publicClient, initial, decay } = await deployBountyFixture();

  // Advance past expiry
  await increaseTime(initial + decay + 1n);

  // Try to batch refund
  await assertReverts(
    publicClient.writeContract({
      address: bounty,
      abi: ["function refundBatch(uint256)"],
      functionName: "refundBatch",
      args: [1n],
    }),
    "NO_FUNDERS",
    {
      operation: "Refund batch with zero funders",
      details: "Contract should reject when funders array is empty",
    }
  );
});
```

**Test P5.8: Forced ETH After Snapshot**
```typescript
it("should handle forced ETH sent after refund snapshot", async () => {
  const { bounty, publicClient, wallets } = await deployWithRefundsEnabledFixture();

  // Get snapshot amount
  const state1 = await getBountyState(bounty, publicClient);
  const snapshot = state1.refundSnapshot;

  // Force-send ETH directly (bypassing receive())
  // This simulates selfdestruct or Coinbase transfer
  const forcedAmount = parseEther("1");
  await wallets[5].sendTransaction({
    to: bounty,
    value: forcedAmount,
    // Note: This will fail due to receive() check
    // Need to use a helper contract that selfdestructs
  });

  // TODO: Deploy ForceETH helper contract
  // For now, verify snapshot doesn't change even if balance increases

  const state2 = await getBountyState(bounty, publicClient);
  assertBigIntEqual(state2.refundSnapshot, snapshot, "Snapshot unchanged");

  // Note: This test may need a ForceETHSender helper contract
});
```

#### Agent 6: 08-security.test.ts

**Test Cases:** 3

**Test N7.1: Reentrancy Protection**
```typescript
it("should prevent reentrancy attacks", async () => {
  // Deploy malicious contract that attempts reentrancy
  const { viem } = await network.connect();
  const maliciousReceiver = await viem.deployContract("ReentrantAttacker", []);

  const { bounty, publicClient } = await deployBountyFixture();

  // Fund from malicious contract
  await maliciousReceiver.write.fundBounty([bounty], {
    value: parseEther("1"),
  });

  // Advance to enable refunds
  await increaseTime(TEST_INITIAL_PERIOD + TEST_DECAY_PERIOD + 1n);

  // Trigger refund (malicious receiver will attempt reentry)
  await assertReverts(
    publicClient.writeContract({
      address: bounty,
      abi: ["function refundBatch(uint256)"],
      functionName: "refundBatch",
      args: [1n],
    }),
    "REENTRANCY",
    {
      operation: "Reentrancy attack",
      details: "Malicious receiver attempts to call refundBatch during receive()",
    }
  );
});
```

**Test N7.2: Forced ETH**
```typescript
it("should not break refunds with forced ETH", async () => {
  // Deploy ForceETH helper
  const { viem } = await network.connect();
  const forcer = await viem.deployContract("ForceETHSender");

  const { bounty, publicClient } = await deployWithRefundsEnabledFixture();

  const state1 = await getBountyState(bounty, publicClient);
  const snapshot = state1.refundSnapshot;

  // Force send 10 ETH via selfdestruct
  await forcer.write.forceSend([bounty], { value: parseEther("10") });

  const state2 = await getBountyState(bounty, publicClient);

  // Balance increased but snapshot unchanged
  assertTrue(state2.balance > state1.balance, "Balance increased");
  assertBigIntEqual(state2.refundSnapshot, snapshot, "Snapshot unchanged");

  // Refunds still work correctly (use snapshot, not balance)
  await publicClient.writeContract({
    address: bounty,
    abi: ["function refundBatch(uint256)"],
    functionName: "refundBatch",
    args: [10n],
  });
});
```

**Test N7.3: Post-Finalized Guards**
```typescript
it("should reject operations after finalization", async () => {
  const { bounty, publicClient, wallets } = await deployFinalizedFixture();

  const state = await getBountyState(bounty, publicClient);
  assertTrue(state.finalized, "Bounty should be finalized");

  // Try to accept after finalized
  await assertReverts(
    publicClient.writeContract({
      address: bounty,
      abi: ["function accept()"],
      functionName: "accept",
      account: EXPLOITER,
    }),
    "FINALIZED",
    { operation: "Accept after finalized" }
  );

  // Try to recover again
  await assertReverts(
    publicClient.writeContract({
      address: bounty,
      abi: ["function recoverKnine()"],
      functionName: "recoverKnine",
    }),
    "FINALIZED",
    { operation: "Recover after finalized" }
  );
});
```

#### Agent 7: 09-edge-cases.test.ts

**Test Cases:** 2+

**Test: Batch Size Zero**
```typescript
it("should revert refundBatch with size 0", async () => {
  const { bounty, publicClient } = await deployWithRefundsEnabledFixture();

  await assertReverts(
    publicClient.writeContract({
      address: bounty,
      abi: ["function refundBatch(uint256)"],
      functionName: "refundBatch",
      args: [0n],
    }),
    "BAD_BATCH_SIZE",
    { operation: "Batch size 0" }
  );
});
```

**Test: State Transitions**
```typescript
it("should maintain correct state transitions", async () => {
  const { bounty, publicClient } = await deployWithOneFunderFixture();

  // State 1: Active, not accepted
  let state = await getBountyState(bounty, publicClient);
  assertFalse(state.finalized);
  assertBigIntEqual(state.acceptedAt, 0n);
  assertFalse(state.refundsEnabled);

  // Accept
  await callAs(EXPLOITER, KNINE, ERC20_ABI, "approve", [bounty, AMOUNT]);
  await publicClient.writeContract({
    address: bounty,
    abi: ["function accept()"],
    functionName: "accept",
    account: EXPLOITER,
  });

  // State 2: Active, accepted
  state = await getBountyState(bounty, publicClient);
  assertFalse(state.finalized);
  assertTrue(state.acceptedAt > 0n);
  assertFalse(state.refundsEnabled);

  // Recover
  await publicClient.writeContract({
    address: bounty,
    abi: ["function recoverKnine()"],
    functionName: "recoverKnine",
  });

  // State 3: Finalized, refunds enabled
  state = await getBountyState(bounty, publicClient);
  assertTrue(state.finalized);
  assertTrue(state.refundsEnabled);
});
```

---

### Phase 2: Integration Test Implementation (Wave 2)

**Objective:** Create 2 integration test files covering scenarios S1-S8

**Approach:** Launch 2 agents in parallel for end-to-end flows

**Dependencies:**
- ✅ Unit tests passing (validates individual functions)
- ✅ Shared utilities tested indirectly through unit tests

#### Agent 8: integration/scenarios-s1-s4.test.ts

**Test Cases:** 4 scenarios (happy paths)

**S1: Single Funder, No Accept, Recover in INITIAL**
```typescript
it("S1: Single funder, no accept, full payout during INITIAL", async () => {
  const fundAmount = parseEther("10");
  const { bounty, publicClient, start, initial, decay, funderAddress } =
    await deployWithOneFunderFixture(fundAmount);

  // Verify timeRemaining
  const state1 = await getBountyState(bounty, publicClient);
  assertBigIntEqual(state1.timeRemaining, initial + decay, "Full time remaining");
  assertBigIntEqual(state1.currentPayout, fundAmount, "Full payout available");

  // Setup exploiter
  await callAs(EXPLOITER, KNINE, ERC20_ABI, "approve", [bounty, AMOUNT]);

  // Capture balances
  const exploiterBefore = await publicClient.getBalance({ address: EXPLOITER });
  const bridgeBefore = await publicClient.readContract({
    address: KNINE,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [SHIBARIUM_BRIDGE],
  });

  // Recover immediately (during INITIAL period)
  // Note: Would need Safe batch to unblacklist
  await impersonateAndFund(K9SAFE);
  await callAs(K9SAFE, KNINE, KNINE_BLACKLIST_ABI, "changeBlackStatus", [[EXPLOITER]]);

  await publicClient.writeContract({
    address: bounty,
    abi: ["function recoverKnine()"],
    functionName: "recoverKnine",
  });

  // Verify outcomes
  const exploiterAfter = await publicClient.getBalance({ address: EXPLOITER });
  const bridgeAfter = await publicClient.readContract({
    address: KNINE,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [SHIBARIUM_BRIDGE],
  });

  assertBigIntEqual(exploiterAfter - exploiterBefore, fundAmount, "Exploiter received full payout");
  assertBigIntEqual(bridgeAfter - bridgeBefore, AMOUNT, "Bridge received KNINE");

  // Verify refunds enabled
  const state2 = await getBountyState(bounty, publicClient);
  assertTrue(state2.finalized);
  assertTrue(state2.refundsEnabled);
  assertBigIntEqual(state2.refundSnapshot, 0n, "No refunds (full payout)");
});
```

**S2-S4:** Similar structure, testing different scenarios

#### Agent 9: integration/scenarios-s5-s8.test.ts

**Test Cases:** 4 scenarios (edge/negative paths)

Similar structure to Agent 8, covering failure scenarios.

---

### Phase 3: Coverage Configuration (Sequential)

**Objective:** Setup coverage reporting and NPM scripts

**Steps:**

1. **Install solidity-coverage**
   ```bash
   pnpm add -D solidity-coverage
   ```

2. **Update hardhat.config.ts**
   ```typescript
   import "solidity-coverage";

   const config: HardhatUserConfig = {
     // ... existing config
     coverage: {
       exclude: ["contracts/mocks/**", "contracts/Counter*.sol"],
     },
   };
   ```

3. **Add NPM scripts** (see package.json section above)

4. **Run coverage**
   ```bash
   pnpm coverage
   ```

5. **Verify thresholds**
   - Statements: 95%+
   - Branches: 90%+
   - Functions: 100%
   - Lines: 95%+

---

## 🤖 AGENT TASK SPECIFICATIONS

### Standard Agent Task Template

Each agent receives a standardized task with the following structure:

```typescript
TASK: Create test/unit/XX-name.test.ts

CONTEXT:
You are implementing unit tests for the KnineRecoveryBountyDecayAcceptMultiFunder contract.
The contract handles multi-funder bounty pooling with time-based decay and pro-rata refunds.

SHARED UTILITIES (DO NOT MODIFY):
- test/shared/constants.ts - Addresses, amounts, config
- test/shared/helpers.ts - Time manipulation, impersonation, calculations
- test/shared/fixtures.ts - Deployment scenarios
- test/shared/assertions.ts - Verbose assertions with colored output

IMPORTS (use exactly these):
import { describe, it } from "node:test";
import { parseEther, parseAbi } from "viem";
import { network } from "hardhat";
import {
  EXPLOITER, KNINE, K9SAFE, SHIBARIUM_BRIDGE,
  MIN_FUNDING, FUNDING_AMOUNTS, AMOUNT,
  TEST_INITIAL_PERIOD, TEST_DECAY_PERIOD
} from "../shared/constants.js";
import {
  callAs, increaseTime, getNowTs, impersonateAndFund,
  setupMockKnine, calculatePayout, captureBalances,
  ERC20_ABI, KNINE_BLACKLIST_ABI
} from "../shared/helpers.js";
import {
  deployBountyFixture,
  deployWithOneFunderFixture,
  deployWithMultiFundersFixture,
  deployWithAcceptanceFixture,
  deployFinalizedFixture,
  deployExpiredFixture,
  deployWithRefundsEnabledFixture,
  getBountyState
} from "../shared/fixtures.js";
import {
  assertReverts, assertBigIntEqual, assertBigIntClose,
  assertTrue, assertFalse, assertBalanceDelta,
  assertEventEmitted
} from "../shared/assertions.js";

TEST CASES TO IMPLEMENT:
[Specific test cases from phase 1 breakdown above]

REQUIREMENTS:
1. DO NOT modify files in test/shared/
2. Use fixtures for all deployments
3. Use verbose assertions (not raw assert.equal)
4. Follow naming: "should [behavior] when [condition]"
5. Include edge cases and boundary conditions
6. Add comments explaining complex test logic
7. Hardhat 3.x auto-resets chain between tests (no beforeEach needed)

REFERENCE EXAMPLES:
- test/unit/02-funding.test.ts (252 lines, 5 tests)
- test/unit/07-views.test.ts (341 lines, 12 tests)

DELIVERABLE:
Complete, working test file with all specified test cases.
Tests should pass on first run or fail with clear error messages.

VALIDATION:
Run: pnpm hardhat test test/unit/XX-name.test.ts
All tests should pass (green checkmarks) or fail with descriptive errors.
```

### Agent Communication Format

**Launch Command:**
```bash
Task(
  subagent_type="general-purpose",
  description="Create 01-deployment.test.ts",
  prompt="[Full task template above with specific test cases]"
)
```

**Expected Agent Output:**
```
✓ Created test/unit/01-deployment.test.ts (45 lines)
✓ Implemented 2 test cases:
  - D0.1: Verify immutables on deployment
  - D0.2: Verify initial state variables
✓ All imports correct
✓ Uses shared utilities
✓ Ready for testing

Recommend running: pnpm hardhat test test/unit/01-deployment.test.ts
```

### Parallel Launch Strategy

**Wave 1: Single Message, 7 Agents**
```typescript
// In one response, make 7 Task tool calls
Task(agent1, "Create 01-deployment.test.ts")
Task(agent2, "Create 03-acceptance.test.ts")
Task(agent3, "Create 04-recovery.test.ts")
Task(agent4, "Create 05-refunds-enable.test.ts")
Task(agent5, "Create 06-refunds-distrib.test.ts")
Task(agent6, "Create 08-security.test.ts")
Task(agent7, "Create 09-edge-cases.test.ts")
```

**Advantages:**
- All agents start simultaneously
- No blocking (each writes different file)
- Shared utilities immutable (no conflicts)
- Results available in ~5-10 minutes

**Agent Isolation:**
Each agent operates independently with:
- ✅ Read access to `test/shared/*`
- ✅ Write access to assigned file only
- ✅ No dependencies on other agents
- ✅ Standard template ensures consistency

---

## ✅ SUCCESS CRITERIA

### Unit Tests (Wave 1)

**Quantitative Metrics:**
- ✅ 7 test files created
- ✅ 16 test cases implemented
- ✅ 0 syntax errors
- ✅ 0 import errors
- ✅ 90%+ tests passing on first run
- ✅ <5 min total agent execution time

**Qualitative Metrics:**
- ✅ Tests use shared utilities correctly
- ✅ Verbose output on failures
- ✅ Clear test names describe intent
- ✅ Edge cases covered
- ✅ No code duplication

**Validation Commands:**
```bash
# Run all unit tests
pnpm hardhat test test/unit/**/*.test.ts

# Expected output:
# ✓ test/unit/01-deployment.test.ts (2 tests)
# ✓ test/unit/02-funding.test.ts (5 tests)
# ✓ test/unit/03-acceptance.test.ts (2 tests)
# ✓ test/unit/04-recovery.test.ts (1 test)
# ✓ test/unit/05-refunds-enable.test.ts (2 tests)
# ✓ test/unit/06-refunds-distrib.test.ts (4 tests)
# ✓ test/unit/07-views.test.ts (12 tests)
# ✓ test/unit/08-security.test.ts (3 tests)
# ✓ test/unit/09-edge-cases.test.ts (2 tests)
#
# Total: 33 tests passed
```

### Integration Tests (Wave 2)

**Quantitative Metrics:**
- ✅ 2 test files created
- ✅ 8 scenarios (S1-S8) implemented
- ✅ 0 errors
- ✅ 100% tests passing

**Qualitative Metrics:**
- ✅ End-to-end flows validated
- ✅ Multi-step interactions work
- ✅ Gas usage reasonable

**Validation Commands:**
```bash
pnpm hardhat test test/integration/**/*.test.ts
```

### Coverage (Wave 3)

**Target Metrics:**
- ✅ 97%+ statement coverage
- ✅ 95%+ branch coverage
- ✅ 100% function coverage
- ✅ 95%+ line coverage

**Validation:**
```bash
pnpm coverage

# Expected: HTML report in coverage/index.html
# Contract: KnineRecoveryBountyDecayAcceptMultiFunder
# Statements: 97.5%
# Branches: 95.2%
# Functions: 100%
# Lines: 97.8%
```

### Overall Project Success

**Must Have:**
- ✅ All 11 test files created
- ✅ 40+ test cases passing
- ✅ 95%+ code coverage
- ✅ 0 critical security gaps
- ✅ CI-ready (can run in automation)

**Nice to Have:**
- ✅ Gas benchmarks for batch operations
- ✅ Fuzz testing for refund calculations
- ✅ Formal verification notes

---

## 📚 APPENDIX: REFERENCE MATERIALS

### A. Contract Overview

**File:** `contracts/KnineRecoveryBountyDecayAcceptMultiFunder.sol` (331 lines)

**Key Functions:**
- `constructor(uint256 initialPeriod, uint256 decayPeriod, bytes32 termsHash)`
- `receive() external payable` - Accept funding (min 0.01 ETH)
- `accept()` - Exploiter freezes payout percentage
- `recoverKnine()` - Execute recovery, pay exploiter, enable refunds
- `refundBatch(uint256 batchSize)` - Process N funders
- `refundAllEth()` - Process all funders
- `claimRefund()` - Pull-based refund claim
- `timeRemaining() view returns (uint256)` - Seconds until expiry
- `currentPayout() view returns (uint256)` - ETH payout if recovered now
- `refundOwed(address) view returns (uint256)` - Pending refund for address

**Key State Variables:**
```solidity
uint256 public immutable START;
uint256 public immutable INITIAL;
uint256 public immutable DECAY;
bytes32 public immutable TERMS_HASH;

uint256 public acceptedAt;
bool public finalized;
bool public refundsEnabled;

mapping(address => uint256) public fundedAmounts;
address[] public funders;
uint256 public totalFunded;

uint256 public refundSnapshot;
uint256 public refundCursor;
mapping(address => uint256) public refunded;
mapping(address => uint256) public owed;
```

### B. Test Plan Reference

**File:** `test-plan.md` (108 lines)

**Scenario Mapping:**
- S1: Single funder, no accept, recover in INITIAL
- S2: Two funders, accept in INITIAL, top-up after accept
- S3: Accept mid-DECAY, extra funding, delayed recovery
- S4: Five funders, no accept, recover mid-DECAY
- S5: Expiry refunds without recovery
- S6: Acceptance after expiry (negative)
- S7: Recovery without unblacklisting (negative)
- S8: Refund push failure → pull claim

### C. Existing Test Files

**File:** `test/KnineRecoveryBountyDecayAccept.ts` (316 lines)
- Tests older version without multi-funder support
- Good reference for:
  - Time manipulation patterns
  - Mock token setup
  - Revert testing
  - Fee-on-transfer token edge cases

**File:** `scripts/interactive-bounty-v2.ts` (1120 lines)
- Interactive testing script covering S1-S8
- Good reference for:
  - Multi-step flows
  - Safe batch patterns (unblacklist → recover → reblacklist)
  - Refund distribution
  - Verbose logging

### D. Mock Contracts

**Available Mocks:**
- `MockKnineBlacklistable.sol` - ERC20 with blacklist for local testing
- `ReceiverRevertsOnReceive.sol` - Malicious receiver for refund failure tests
- `FeeOnTransferERC20.sol` - Token with transfer fees
- `FalseReturnERC20.sol` - Non-standard return values

**Create if Needed:**
- `ReentrantAttacker.sol` - For reentrancy tests
- `ForceETHSender.sol` - Uses selfdestruct to force ETH

### E. Common Patterns

**Time Travel:**
```typescript
// Advance 500 seconds
await increaseTime(500n);

// Go to specific timestamp
const target = await getNowTs() + 1000n;
await setNextTimestamp(target);
```

**Impersonation:**
```typescript
// Call as specific address
await callAs(EXPLOITER, KNINE, ERC20_ABI, "approve", [bounty, AMOUNT]);

// Impersonate with ETH
await impersonateAndFund(K9SAFE, parseEther("10"));
```

**Balance Tracking:**
```typescript
const before = await captureBalances([addr1, addr2]);
// ... do operations
const after = await captureBalances([addr1, addr2]);
const delta = getBalanceDelta(before, after, addr1);
assertBigIntEqual(delta, expected, "Balance change");
```

**Safe Batch Pattern:**
```typescript
// Unblacklist → Recover → Re-blacklist (atomic)
await setAutomine(false);
const pending: PendingTx[] = [];

await callAs(K9SAFE, KNINE, ABI, "changeBlackStatus", [[EXPLOITER]], 0n, { pending });
await callAs(K9SAFE, bounty, ABI, "recoverKnine", [], 0n, { pending });
await callAs(K9SAFE, KNINE, ABI, "changeBlackStatus", [[EXPLOITER]], 0n, { pending });

await rpc("evm_mine", []);
await setAutomine(true);

for (const tx of pending) await ensureTxSuccess(tx);
```

### F. Troubleshooting

**Common Issues:**

1. **"Sender doesn't have enough funds"**
   - Solution: Use `setBalance()` or `impersonateAndFund()`

2. **"Impersonation not allowed"**
   - Solution: Call `await impersonate(address)` before transactions

3. **"Transaction reverted without reason"**
   - Solution: Check `extractRevert(error)` or enable `DEBUG_REVERTS=1`

4. **"KNINE transfer fails"**
   - Solution: Ensure mock KNINE is installed or fork has real KNINE

5. **"Tests fail on fork but pass locally"**
   - Solution: Fork may have different gas prices or block timestamps

### G. Performance Tips

**Fast Tests:**
- Use shorter periods: `TEST_INITIAL_PERIOD = 1000n` instead of production values
- Snapshot/revert instead of full redeploy
- Run unit tests before integration tests (fail fast)

**Debugging:**
- Enable verbose mode: `VERBOSE=1 pnpm test`
- Check specific test: `pnpm hardhat test test/unit/02-funding.test.ts`
- Add `log()` calls in shared helpers

### H. Future Enhancements

**After Core Coverage:**
1. Gas optimization tests (batch sizes 10, 50, 100 funders)
2. Fuzz testing for refund calculations
3. Formal verification of payout formula
4. Stress tests (1000+ funders)
5. Integration with actual Gnosis Safe multi-sig
6. Frontend integration tests (if UI exists)

---

## 📝 FINAL NOTES

### Why This Document?

This comprehensive plan serves multiple purposes:

1. **Handoff Document**: Any new developer or agent can pick up and continue
2. **Decision Record**: Explains why we chose this architecture
3. **Task Specification**: Clear, actionable instructions for each agent
4. **Success Criteria**: Objective metrics to know when we're done
5. **Reference Guide**: Quick lookup for patterns and troubleshooting

### How to Use This Plan

**For Agents:**
1. Read your assigned section (e.g., "Agent 1: 01-deployment.test.ts")
2. Follow the standard template exactly
3. Use shared utilities (do not reinvent)
4. Validate your output matches expected format
5. Report completion status clearly

**For Developers:**
1. Understand the "why" before modifying architecture
2. Run tests incrementally (unit → integration → coverage)
3. Add new test cases following existing patterns
4. Update this document when making significant changes

**For Project Managers:**
1. Use "Current State Assessment" to track progress
2. Check "Success Criteria" for objective completion metrics
3. Review "Test Plan Reference" for requirements mapping

### Next Steps

**Immediate:**
1. ✅ Review and approve this plan
2. ✅ Launch Wave 1 (7 agents in parallel)
3. ✅ Validate unit tests pass
4. ✅ Launch Wave 2 (2 agents in parallel)
5. ✅ Configure coverage reporting
6. ✅ Generate final coverage report

**Future:**
1. Add gas benchmarking
2. Implement fuzz tests
3. Document findings for audit
4. Create deployment checklist

---

**Document Version:** 1.0
**Last Updated:** 2025-10-30
**Author:** Test Implementation Team
**Status:** Ready for Agent Deployment (Wave 1)
