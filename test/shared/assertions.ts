import assert from "node:assert/strict";
import { Address, formatEther } from "viem";
import type { PublicClient } from "viem";
import { log, formatAddress, formatEthAmount } from "./helpers.js";

// ===== Numeric Assertions =====

export function assertBigIntEqual(
  actual: bigint,
  expected: bigint,
  context: string
) {
  if (actual === expected) {
    log(`✓ ${context}: ${formatEther(actual)} (exact match)`, "green");
    return;
  }

  log(`✗ ${context}`, "red");
  log(`  Expected: ${formatEther(expected)}`, "red");
  log(`  Actual:   ${formatEther(actual)}`, "red");
  log(`  Diff:     ${formatEther(actual - expected)}`, "red");

  assert.equal(actual, expected, context);
}

export function assertBigIntClose(
  actual: bigint,
  expected: bigint,
  tolerance: bigint,
  context: string
) {
  const diff = actual > expected ? actual - expected : expected - actual;

  if (diff <= tolerance) {
    log(`✓ ${context}: ${formatEther(actual)} (within tolerance)`, "green");
    log(`  Expected: ${formatEther(expected)}, Tolerance: ${formatEther(tolerance)}`, "dim");
    return;
  }

  log(`✗ ${context}`, "red");
  log(`  Expected:  ${formatEther(expected)}`, "red");
  log(`  Actual:    ${formatEther(actual)}`, "red");
  log(`  Diff:      ${formatEther(diff)} (tolerance: ${formatEther(tolerance)})`, "red");

  assert.ok(diff <= tolerance, `${context}: diff ${diff} exceeds tolerance ${tolerance}`);
}

export function assertGreaterThan(
  actual: bigint,
  threshold: bigint,
  context: string
) {
  if (actual > threshold) {
    log(`✓ ${context}: ${formatEther(actual)} > ${formatEther(threshold)}`, "green");
    return;
  }

  log(`✗ ${context}`, "red");
  log(`  Expected > ${formatEther(threshold)}`, "red");
  log(`  Actual:    ${formatEther(actual)}`, "red");

  assert.ok(actual > threshold, context);
}

export function assertLessThan(
  actual: bigint,
  threshold: bigint,
  context: string
) {
  if (actual < threshold) {
    log(`✓ ${context}: ${formatEther(actual)} < ${formatEther(threshold)}`, "green");
    return;
  }

  log(`✗ ${context}`, "red");
  log(`  Expected < ${formatEther(threshold)}`, "red");
  log(`  Actual:    ${formatEther(actual)}`, "red");

  assert.ok(actual < threshold, context);
}

// ===== Boolean Assertions =====

export function assertTrue(actual: boolean, context: string) {
  if (actual) {
    log(`✓ ${context}: true`, "green");
    return;
  }

  log(`✗ ${context}: expected true, got false`, "red");
  assert.equal(actual, true, context);
}

export function assertFalse(actual: boolean, context: string) {
  if (!actual) {
    log(`✓ ${context}: false`, "green");
    return;
  }

  log(`✗ ${context}: expected false, got true`, "red");
  assert.equal(actual, false, context);
}

// ===== Balance Assertions =====

export async function assertBalanceEqual(
  publicClient: PublicClient,
  address: Address,
  expected: bigint,
  context: string
) {
  const actual = await publicClient.getBalance({ address });
  assertBigIntEqual(actual, expected, `${context} (${formatAddress(address)})`);
}

export async function assertBalanceDelta(
  publicClient: PublicClient,
  address: Address,
  balanceBefore: bigint,
  expectedDelta: bigint,
  context: string
) {
  const balanceAfter = await publicClient.getBalance({ address });
  const actualDelta = balanceAfter - balanceBefore;

  assertBigIntEqual(
    actualDelta,
    expectedDelta,
    `${context} - ${formatAddress(address)} balance delta`
  );
}

// ===== Revert Assertions =====

export interface RevertContext {
  operation: string;
  expectedError?: string;
  details?: string;
}

export async function assertReverts(
  promise: Promise<any>,
  expectedError: string | undefined,
  context: RevertContext
) {
  try {
    await promise;

    // If we get here, it didn't revert
    log(`✗ ${context.operation}: Expected revert but succeeded`, "red");
    if (expectedError) {
      log(`  Expected error: ${expectedError}`, "red");
    }
    if (context.details) {
      log(`  Details: ${context.details}`, "dim");
    }

    assert.fail(`Expected transaction to revert${expectedError ? ` with ${expectedError}` : ""}`);
  } catch (error: any) {
    // Extract error message
    const errorMessage = extractErrorMessage(error);

    if (!expectedError) {
      // Any revert is acceptable
      log(`✓ ${context.operation}: Reverted`, "green");
      if (errorMessage) {
        log(`  Error: ${errorMessage}`, "dim");
      }
      return;
    }

    // Check for expected error
    const matches = errorMessage?.includes(expectedError) ?? false;

    if (matches) {
      log(`✓ ${context.operation}: Reverted with ${expectedError}`, "green");
      if (context.details) {
        log(`  ${context.details}`, "dim");
      }
    } else {
      log(`✗ ${context.operation}: Wrong revert reason`, "red");
      log(`  Expected: ${expectedError}`, "red");
      log(`  Actual:   ${errorMessage ?? "<no message>"}`, "red");
      if (context.details) {
        log(`  Details: ${context.details}`, "dim");
      }
      throw error;
    }
  }
}

function extractErrorMessage(error: any): string | undefined {
  // Try various error message locations
  if (error?.reason) return error.reason;
  if (error?.message) {
    const match = error.message.match(/reverted with reason string ['"](.+)['"]/);
    if (match) return match[1];

    const customMatch = error.message.match(/reverted with custom error ['"](.+)['"]/);
    if (customMatch) return customMatch[1];

    // For simple messages like "ONLY_EXPLOITER"
    const lines = error.message.split("\n");
    for (const line of lines) {
      if (line.includes("reverted")) return line;
    }

    return error.message;
  }
  if (error?.shortMessage) return error.shortMessage;
  if (error?.data?.message) return error.data.message;
  return undefined;
}

// ===== Event Assertions =====

export function assertEventEmitted(
  events: any[],
  eventName: string,
  expectedArgs?: Record<string, any>,
  context?: string
) {
  const matchingEvents = events.filter(e => e.eventName === eventName);

  if (matchingEvents.length === 0) {
    log(`✗ Event ${eventName} not emitted${context ? ` (${context})` : ""}`, "red");
    log(`  Found events: ${events.map(e => e.eventName).join(", ")}`, "dim");
    assert.fail(`Expected event ${eventName} to be emitted`);
  }

  log(`✓ Event ${eventName} emitted${context ? ` (${context})` : ""}`, "green");

  if (expectedArgs) {
    const event = matchingEvents[0];
    for (const [key, expectedValue] of Object.entries(expectedArgs)) {
      const actualValue = event.args[key];

      if (typeof expectedValue === "bigint" && typeof actualValue === "bigint") {
        if (actualValue !== expectedValue) {
          log(`  ✗ Arg ${key}: expected ${expectedValue}, got ${actualValue}`, "red");
          assert.equal(actualValue, expectedValue, `Event arg ${key}`);
        } else {
          log(`  ✓ Arg ${key}: ${actualValue}`, "dim");
        }
      } else if (actualValue !== expectedValue) {
        log(`  ✗ Arg ${key}: expected ${expectedValue}, got ${actualValue}`, "red");
        assert.equal(actualValue, expectedValue, `Event arg ${key}`);
      } else {
        log(`  ✓ Arg ${key}: ${actualValue}`, "dim");
      }
    }
  }
}

export function assertEventCount(
  events: any[],
  eventName: string,
  expectedCount: number,
  context?: string
) {
  const matchingEvents = events.filter(e => e.eventName === eventName);
  const actualCount = matchingEvents.length;

  if (actualCount === expectedCount) {
    log(`✓ ${eventName} emitted ${actualCount} time(s)${context ? ` (${context})` : ""}`, "green");
    return;
  }

  log(`✗ ${eventName} count mismatch${context ? ` (${context})` : ""}`, "red");
  log(`  Expected: ${expectedCount}`, "red");
  log(`  Actual:   ${actualCount}`, "red");

  assert.equal(actualCount, expectedCount, `Event ${eventName} count`);
}

// ===== Array Assertions =====

export function assertArrayLength(
  array: any[],
  expectedLength: number,
  context: string
) {
  if (array.length === expectedLength) {
    log(`✓ ${context}: length ${array.length}`, "green");
    return;
  }

  log(`✗ ${context}: length mismatch`, "red");
  log(`  Expected: ${expectedLength}`, "red");
  log(`  Actual:   ${array.length}`, "red");

  assert.equal(array.length, expectedLength, context);
}

// ===== Contract State Assertions =====

export async function assertContractState(
  publicClient: PublicClient,
  contract: Address,
  abi: any,
  checks: Record<string, { expected: any; context: string }>
) {
  log(`🔍 Checking contract state for ${formatAddress(contract)}...`, "cyan");

  for (const [functionName, { expected, context }] of Object.entries(checks)) {
    const actual = await publicClient.readContract({
      address: contract,
      abi,
      functionName,
    });

    if (typeof expected === "bigint" && typeof actual === "bigint") {
      assertBigIntEqual(actual, expected, context);
    } else if (typeof expected === "boolean" && typeof actual === "boolean") {
      if (expected) {
        assertTrue(actual, context);
      } else {
        assertFalse(actual, context);
      }
    } else {
      assert.equal(actual, expected, context);
    }
  }
}

// ===== Snapshot Comparison =====

export interface StateSnapshot {
  [key: string]: bigint | boolean | string;
}

export function assertStateChange(
  before: StateSnapshot,
  after: StateSnapshot,
  expectedChanges: Partial<StateSnapshot>,
  context: string
) {
  log(`🔍 Checking state changes: ${context}`, "cyan");

  for (const [key, expectedValue] of Object.entries(expectedChanges)) {
    const beforeValue = before[key];
    const afterValue = after[key];

    if (afterValue === expectedValue) {
      log(`  ✓ ${key}: ${beforeValue} → ${afterValue}`, "green");
    } else {
      log(`  ✗ ${key}: Expected ${expectedValue}, got ${afterValue}`, "red");
      assert.equal(afterValue, expectedValue, `${context}: ${key}`);
    }
  }
}
