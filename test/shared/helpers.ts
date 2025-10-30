import { Address, Hex, encodeFunctionData, formatEther, parseAbi } from "viem";
import type { PublicClient } from "viem";
import { network } from "hardhat";
import { KNINE, K9SAFE, EXPLOITER, AMOUNT, IMPERSONATE_ETH, VERBOSE } from "./constants.js";

// ===== Color Utilities =====
export const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

export function log(message: string, color?: keyof typeof colors) {
  if (!VERBOSE) return;
  const c = color ? colors[color] : "";
  console.log(`${c}${message}${colors.reset}`);
}

// ===== RPC Helpers =====
async function rpc(method: string, params: any[] = []) {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const transport: any = (publicClient as any).transport;
  if (!transport?.request) {
    throw new Error("RPC transport not available on this network");
  }
  return await transport.request({ method, params });
}

function asHex(value: bigint): Hex {
  return `0x${value.toString(16)}` as Hex;
}

// ===== Time Manipulation =====

export async function getNowTs(): Promise<bigint> {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const block = await publicClient.getBlock();
  return block.timestamp;
}

export async function setNextTimestamp(ts: bigint) {
  log(`⏰ Setting next block timestamp to ${ts}`, "cyan");
  await rpc("evm_setNextBlockTimestamp", [Number(ts)]);
  await rpc("evm_mine", []);
}

export async function increaseTime(seconds: bigint) {
  const now = await getNowTs();
  const target = now + seconds;
  log(`⏰ Increasing time by ${seconds}s (${formatTime(seconds)})`, "cyan");
  await setNextTimestamp(target);
  return target;
}

export function formatTime(seconds: bigint): string {
  const s = Number(seconds);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${(s / 60).toFixed(1)}m`;
  if (s < 86400) return `${(s / 3600).toFixed(1)}h`;
  return `${(s / 86400).toFixed(1)}d`;
}

// ===== Account Impersonation =====

export async function impersonate(address: Address) {
  await rpc("hardhat_impersonateAccount", [address]);
  // Auto-fund with gas money (matches old test behavior)
  await rpc("hardhat_setBalance", [address, asHex(IMPERSONATE_ETH)]);
  log(`👤 Impersonating ${formatAddress(address)} with ${formatEther(IMPERSONATE_ETH)} ETH`, "dim");
}

export async function stopImpersonate(address: Address) {
  await rpc("hardhat_stopImpersonatingAccount", [address]);
}

export async function setBalance(address: Address, amount: bigint) {
  log(`💰 Setting balance for ${formatAddress(address)} to ${formatEther(amount)} ETH`, "dim");
  await rpc("hardhat_setBalance", [address, asHex(amount)]);
}

export async function impersonateAndFund(address: Address, ethAmount: bigint = IMPERSONATE_ETH) {
  await impersonate(address);
  await setBalance(address, ethAmount);
  log(`👤 Impersonating ${formatAddress(address)} with ${formatEther(ethAmount)} ETH`, "magenta");
}

// ===== Balance Tracking =====

export interface BalanceSnapshot {
  [address: string]: bigint;
}

export async function captureBalances(addresses: Address[]): Promise<BalanceSnapshot> {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const snapshot: BalanceSnapshot = {};

  for (const addr of addresses) {
    snapshot[addr.toLowerCase()] = await publicClient.getBalance({ address: addr });
  }

  return snapshot;
}

export function getBalanceDelta(before: BalanceSnapshot, after: BalanceSnapshot, address: Address): bigint {
  const key = address.toLowerCase();
  return (after[key] ?? 0n) - (before[key] ?? 0n);
}

// ===== Contract Call Helpers =====

export async function callAs(
  from: Address,
  to: Address,
  abi: any,
  functionName: string,
  args: readonly unknown[] = [],
  value: bigint = 0n
) {
  const data = encodeFunctionData({ abi, functionName, args });

  // Use SINGLE transport instance for all operations (critical for Hardhat 3.x)
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const transport: any = (publicClient as any).transport;

  if (!transport?.request) {
    throw new Error("RPC transport not available");
  }

  // Impersonate
  await transport.request({
    method: "hardhat_impersonateAccount",
    params: [from],
  });

  // Fund
  await transport.request({
    method: "hardhat_setBalance",
    params: [from, asHex(IMPERSONATE_ETH)],
  });

  log(`👤 Impersonating ${formatAddress(from)} with ${formatEther(IMPERSONATE_ETH)} ETH`, "dim");

  try {
    // Send transaction
    const hash: Hex = await transport.request({
      method: "eth_sendTransaction",
      params: [{
        from,
        to,
        data,
        value: value ? asHex(value) : undefined,
      }],
    });

    log(`📤 ${formatAddress(from)} → ${functionName}(${formatArgs(args)})`, "dim");
    return hash;
  } finally {
    // Stop impersonating
    await transport.request({
      method: "hardhat_stopImpersonatingAccount",
      params: [from],
    });
  }
}

// ===== Mock KNINE Setup =====

const KNINE_BLACKLIST_ABI = parseAbi([
  "function blacklist(address) view returns (bool)",
  "function changeBlackStatus(address[] users)",
  "function mint(address to, uint256 amount)",
]);

const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
]);

export async function setupMockKnine() {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [deployer] = await viem.getWalletClients();
  const transport: any = (publicClient as any).transport;

  // Check if KNINE contract exists (fork mode)
  const existingCode = await publicClient.getCode({ address: KNINE });
  const hasCode = existingCode !== undefined && !/^0x0*$/i.test(existingCode);

  if (hasCode) {
    log("✓ Detected existing KNINE contract (fork mode)", "green");
    return { isFork: true, deployer };
  }

  // Deploy mock KNINE
  log("📦 Deploying MockKnineBlacklistable...", "yellow");
  const MockKnine = await viem.deployContract("MockKnineBlacklistable", [K9SAFE]);
  const mockAddress = MockKnine.address as Address;

  // Copy bytecode to KNINE address using single transport
  const runtime = await publicClient.getCode({ address: mockAddress });
  await transport.request({
    method: "hardhat_setCode",
    params: [KNINE, runtime],
  });

  log(`✓ Bytecode copied to ${KNINE}`, "dim");

  // Mint AMOUNT to exploiter
  await callAs(K9SAFE, KNINE, KNINE_BLACKLIST_ABI, "mint", [EXPLOITER, AMOUNT]);

  // Ensure exploiter is blacklisted initially
  const isBlack = await publicClient.readContract({
    address: KNINE,
    abi: KNINE_BLACKLIST_ABI,
    functionName: "blacklist",
    args: [EXPLOITER],
  });

  if (!isBlack) {
    await callAs(K9SAFE, KNINE, KNINE_BLACKLIST_ABI, "changeBlackStatus", [[EXPLOITER]]);
  }

  log(`✓ Mock KNINE installed at ${KNINE}`, "green");
  log(`✓ Minted ${formatEther(AMOUNT)} KNINE to ${formatAddress(EXPLOITER)}`, "green");

  return { isFork: false, deployer };
}

// ===== Payout Calculations =====

export function calculatePayout(
  balance: bigint,
  timestamp: bigint,
  start: bigint,
  initial: bigint,
  decay: bigint
): bigint {
  const t = timestamp > start ? timestamp - start : 0n;
  if (t <= initial) return balance;
  if (t >= initial + decay) return 0n;
  return (balance * (initial + decay - t)) / decay;
}

export function calculateProRataRefund(
  funderAmount: bigint,
  totalFunded: bigint,
  refundSnapshot: bigint
): bigint {
  if (totalFunded === 0n) return 0n;
  return (funderAmount * refundSnapshot) / totalFunded;
}

// ===== Formatting Helpers =====

export function formatAddress(address: Address): string {
  if (address === EXPLOITER) return "Exploiter";
  if (address === K9SAFE) return "K9Safe";
  if (address === KNINE) return "KNINE";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatArgs(args: readonly unknown[]): string {
  return args.map(arg => {
    if (typeof arg === "bigint") {
      if (arg > 1e18) return formatEther(arg) + " ETH";
      return arg.toString();
    }
    if (typeof arg === "string" && arg.startsWith("0x")) {
      return formatAddress(arg as Address);
    }
    if (Array.isArray(arg)) {
      return `[${arg.map(a => formatArgs([a])).join(", ")}]`;
    }
    return String(arg);
  }).join(", ");
}

export function formatEthAmount(wei: bigint): string {
  return `${formatEther(wei)} ETH`;
}

// ===== Snapshot Management =====

export async function takeSnapshot(): Promise<string> {
  const snapshotId = await rpc("evm_snapshot", []);
  log(`📸 Snapshot taken: ${snapshotId}`, "dim");
  return snapshotId;
}

export async function revertToSnapshot(snapshotId: string) {
  await rpc("evm_revert", [snapshotId]);
  log(`⏮️  Reverted to snapshot: ${snapshotId}`, "dim");
}

// ===== Fee Helpers =====

export async function estimateGas(
  from: Address,
  to: Address,
  data?: Hex,
  value?: bigint
): Promise<bigint> {
  try {
    const estimate = await rpc("eth_estimateGas", [{
      from,
      to,
      data,
      value: value ? asHex(value) : undefined,
    }]);
    return BigInt(estimate);
  } catch {
    return 500_000n; // Default fallback
  }
}

export { ERC20_ABI, KNINE_BLACKLIST_ABI };
