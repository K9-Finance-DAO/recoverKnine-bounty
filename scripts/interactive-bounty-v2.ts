//pnpm hardhat compile
// pnpm hardhat run --network localhost scripts/interactive-bounty-v2.ts

import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { network } from "hardhat";
import {
  Address,
  Hex,
  encodeFunctionData,
  formatEther,
  getAddress,
  parseAbi,
  parseEther,
  parseGwei,
} from "viem";
import type { PublicClient, WalletClient } from "viem";

// Hardcoded addresses from the production contract
const KNINE = getAddress("0x91fbB2503AC69702061f1AC6885759Fc853e6EaE");
const EXPLOITER = getAddress("0x999E025a2a0558c07DBf7F021b2C9852B367e80A");
const K9SAFE = getAddress("0xDA4Df6E2121eDaB7c33Ed7FE0f109350939eDA84");
const SHIBARIUM_BRIDGE = getAddress("0x6Aca26bFCE7675FF71C734BF26C8c0aC4039A4Fa");

const INITIAL_PERIOD = 1_900_800n; // 22 days
const DECAY_PERIOD = 604_800n; // 7 days
const TERMS_HASH = "0xdc41ed1a9106d5b1a5325e996240b1d76ee437ead8b8471e627f9b53ad2d3d1f" as Hex;
const AMOUNT = 248_989_400_000_000_000_000_000_000_000n; // 248.9894B * 1e18

// ===== ABIs =====
const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transferFrom(address,address,uint256) returns (bool)",
]);

const KNINE_BLACKLIST_ABI = parseAbi([
  "function blacklist(address) view returns (bool)",
  "function changeBlackStatus(address[] users)",
  "function mint(address to, uint256 amount)",
]);

const BOUNTY_ABI = parseAbi([
  "function START() view returns (uint256)",
  "function INITIAL() view returns (uint256)",
  "function DECAY() view returns (uint256)",
  "function TERMS_HASH() view returns (bytes32)",
  "function accept()",
  "function recoverKnine()",
  "function refundBatch(uint256)",
  "function refundAllEth()",
  "function claimRefund()",
  "function refundOwed(address) view returns (uint256)",
  "function fundedAmounts(address) view returns (uint256)",
  "function totalFunded() view returns (uint256)",
  "function refundsEnabled() view returns (bool)",
  "function refundSnapshot() view returns (uint256)",
  "function refundCursor() view returns (uint256)",
  "function acceptedAt() view returns (uint256)",
  "function finalized() view returns (bool)",
  "function currentPayout() view returns (uint256)",
  "function timeRemaining() view returns (uint256)",
]);

const RECEIVER_REVERT_ABI = parseAbi([
  "function setRevertOnReceive(bool enabled)",
  "function claim()",
]);

// ===== Formatting helpers =====
const fmt = {
  bold: (msg: string) => `\x1b[1m${msg}\x1b[22m`,
  dim: (msg: string) => `\x1b[2m${msg}\x1b[22m`,
  green: (msg: string) => `\x1b[32m${msg}\x1b[39m`,
  yellow: (msg: string) => `\x1b[33m${msg}\x1b[39m`,
  red: (msg: string) => `\x1b[31m${msg}\x1b[39m`,
};

function banner(title: string) {
  const line = "═".repeat(86);
  output.write(`\n${line}\n`);
  const padded = title.padEnd(82, " ");
  output.write(`║ ${fmt.bold(padded)} ║\n`);
  output.write(`${line}\n`);
}

function section(title: string) {
  output.write(`\n${fmt.bold(title)}\n`);
  output.write(`${"-".repeat(title.length + 4)}\n`);
}

function step(label: string) {
  output.write(`  ▸ ${label}\n`);
}

function verdict(label: string, ok: boolean, note?: string) {
  const badge = ok ? fmt.green("✔") : fmt.red("✘");
  output.write(`    ${badge} ${label}${note ? ` — ${note}` : ""}\n`);
}

function formatPct(n: bigint, d: bigint): string {
  if (d === 0n) return "0.00%";
  const scaled = (n * 10_000n) / d; // two decimals
  const intPart = scaled / 100n;
  const frac = (scaled % 100n).toString().padStart(2, "0");
  return `${intPart}.${frac}%`;
}

function formatCallArg(arg: unknown): string {
  if (typeof arg === "bigint") return arg.toString();
  if (typeof arg === "string") return arg;
  if (Array.isArray(arg)) return `[${arg.map(formatCallArg).join(", ")}]`;
  if (arg && typeof arg === "object") {
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }
  return String(arg);
}

function extractRevert(error: any): string | undefined {
  const candidates: Array<unknown> = [
    error?.reason,
    error?.shortMessage,
    error?.data?.message,
    error?.data?.data?.message,
    error?.error?.message,
    error?.error?.data?.message,
    error?.message,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const message = candidate;
    const patterns = [
      /reason string ['"]([^'"]+)['"]/i,
      /execution reverted:? ?['"]?([^'"]+)['"]?/i,
      /revert(?:ed)? ['"]?([^'"]+)['"]?/i,
      /custom error ['"]?([^'"]+)['"]?/i,
    ];
    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
  }
  return undefined;
}

interface CallContext {
  from: Address;
  to: Address;
  label: string;
  functionName?: string;
  args?: readonly unknown[];
  value?: bigint;
}

function buildCallError(original: any, context: CallContext): Error {
  const reason = extractRevert(original);
  const args = context.args ? context.args.map(formatCallArg).join(", ") : "";
  let message = `${context.label} failed`;
  if (context.functionName) {
    message += ` | ${context.functionName}(${args})`;
  }
  if (reason) {
    message += ` | reason: ${reason}`;
  }
  const err = new Error(message);
  (err as any).isCallError = true;
  (err as any).context = context;
  (err as any).reason = reason;
  (err as any).cause = original;
  return err;
}

function printCallError(err: any) {
  const context = err?.context as CallContext | undefined;
  output.write(`\n${fmt.red("Transaction reverted")}${context?.label ? ` – ${context.label}` : ""}\n`);
  if (context) {
    output.write(`  from: ${context.from}\n`);
    output.write(`  to  : ${context.to}\n`);
    if (context.functionName) {
      const args = context.args ? context.args.map(formatCallArg).join(", ") : "";
      output.write(`  call: ${context.functionName}(${args})\n`);
    }
    if (typeof context.value === "bigint" && context.value !== 0n) {
      output.write(`  value: ${formatEther(context.value)} ETH\n`);
    }
  }
  if (err?.reason) {
    output.write(`  reason: ${err.reason}\n`);
  }
  if (err?.cause?.message && process.env.DEBUG_REVERTS === "1") {
    output.write(fmt.dim(`  raw: ${err.cause.message}`) + "\n");
  }
  output.write("\n");
}

const WAIT_ICON = "⏸️";
let PAUSE_ENABLED = true;
async function pause(rl: readline.Interface, message: string) {
  output.write(`\n${WAIT_ICON}  ${message}\n`);
  if (!PAUSE_ENABLED) return;
  await rl.question("Press Enter to continue...");
}

// ===== RPC helpers =====
function asHex(value: bigint): Hex {
  return (`0x${value.toString(16)}`) as Hex;
}

async function rpc(method: string, params: any[] = []) {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const transport: any = (publicClient as any).transport;
  if (!transport?.request) {
    throw new Error("RPC transport not available on this network");
  }
  return await transport.request({ method, params });
}

async function impersonate(address: Address) {
  await rpc("hardhat_impersonateAccount", [address]);
}

async function stopImpersonate(address: Address) {
  await rpc("hardhat_stopImpersonatingAccount", [address]);
}

async function setBalance(address: Address, amount: bigint) {
  await rpc("hardhat_setBalance", [address, asHex(amount)]);
}

async function setAutomine(enabled: boolean) {
  await rpc("evm_setAutomine", [enabled]);
}

async function feeFields() {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const block = await publicClient.getBlock();
  const base = block.baseFeePerGas ?? parseGwei("1");
  const priority = parseGwei(process.env.PRIORITY_GWEI || "2");
  const maxFee = base * 2n + priority;
  return {
    maxFeePerGas: asHex(maxFee),
    maxPriorityFeePerGas: asHex(priority),
  };
}

async function sendAs(
  from: Address,
  to: Address,
  value: bigint,
  data?: Hex,
  context?: Partial<CallContext>
) {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const baseTx: any = { from, to, value: asHex(value), data };
  const fees = await feeFields();
  let gasLimit = BigInt(process.env.GAS_LIMIT || "6000000");
  try {
    const estimate = await rpc("eth_estimateGas", [baseTx]);
    gasLimit = (BigInt(estimate) * 12n) / 10n;
  } catch {
    // use default
  }
  const bal = await publicClient.getBalance({ address: from });
  const needed = value + gasLimit * BigInt(fees.maxFeePerGas);
  if (bal < needed) {
    await setBalance(from, needed);
  }
  const ctx: CallContext = {
    from,
    to,
    value,
    label: context?.label ?? (data ? "contract call" : "ETH transfer"),
    functionName: context?.functionName,
    args: context?.args,
  };
  await impersonate(from);
  try {
    await rpc("eth_sendTransaction", [{ ...baseTx, gas: asHex(gasLimit), ...fees }]);
  } catch (error) {
    throw buildCallError(error, ctx);
  } finally {
    await stopImpersonate(from);
  }
}

async function callAs(from: Address, to: Address, abi: any, functionName: string, args: readonly unknown[] = [], value: bigint = 0n) {
  const data = encodeFunctionData({ abi, functionName, args });
  await sendAs(from, to, value, data, {
    label: `call ${functionName}`,
    functionName,
    args,
  });
}

async function callWithWallet(wallet: WalletClient, publicClient: PublicClient, address: Address, abi: any, functionName: string, args: readonly unknown[] = [], value: bigint = 0n) {
  if (!wallet.account) {
    throw new Error("Wallet client missing account information");
  }
  const from = wallet.account.address as Address;
  try {
    const hash = await wallet.writeContract({ address, abi, functionName, args, value });
    await publicClient.waitForTransactionReceipt({ hash });
  } catch (error) {
    throw buildCallError(error, {
      from,
      to: address,
      value,
      label: `wallet call ${functionName}`,
      functionName,
      args,
    });
  }
}

async function getNowTs(): Promise<bigint> {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const block = await publicClient.getBlock();
  return block.timestamp;
}

async function increaseTime(seconds: bigint) {
  const now = await getNowTs();
  await rpc("evm_setNextBlockTimestamp", [Number(now + seconds)]);
  await rpc("evm_mine", []);
}

async function readUint(address: Address, abi: any, functionName: string, args: readonly unknown[] = []): Promise<bigint> {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  return await publicClient.readContract({ address, abi, functionName, args });
}

async function readBool(address: Address, abi: any, functionName: string, args: readonly unknown[] = []): Promise<boolean> {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  return await publicClient.readContract({ address, abi, functionName, args });
}

// ===== Artifact helpers =====
const ARTIFACTS_ROOT = path.join(process.cwd(), "artifacts");
function loadArtifact(relative: string) {
  return JSON.parse(readFileSync(path.join(ARTIFACTS_ROOT, relative), "utf8"));
}

const BOUNTY_ARTIFACT = loadArtifact("contracts/KnineRecoveryBountyDecayAcceptMultiFunder.sol/KnineRecoveryBountyDecayAcceptMultiFunder.json");
const MOCK_KNINE_ARTIFACT = loadArtifact("contracts/mocks/MockKnineBlacklistable.sol/MockKnineBlacklistable.json");
const RECEIVER_REVERT_ARTIFACT = loadArtifact("contracts/mocks/ReceiverRevertsOnReceive.sol/ReceiverRevertsOnReceive.json");

async function deployFromArtifact(wallet: WalletClient, publicClient: PublicClient, artifact: any, args: readonly unknown[] = [], value: bigint = 0n): Promise<Address> {
  const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode as Hex, args, value });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return receipt.contractAddress as Address;
}

interface DeploymentInfo {
  address: Address;
  start: bigint;
  initial: bigint;
  decay: bigint;
}

async function deployBounty(wallet: WalletClient, publicClient: PublicClient): Promise<DeploymentInfo> {
  const address = await deployFromArtifact(wallet, publicClient, BOUNTY_ARTIFACT, [INITIAL_PERIOD, DECAY_PERIOD, TERMS_HASH]);
  const [start, initial, decay] = await Promise.all([
    readUint(address, BOUNTY_ABI, "START"),
    readUint(address, BOUNTY_ABI, "INITIAL"),
    readUint(address, BOUNTY_ABI, "DECAY"),
  ]);
  return { address, start, initial, decay };
}

function payoutAt(balance: bigint, timestamp: bigint, start: bigint, initial: bigint, decay: bigint): bigint {
  const t = timestamp > start ? timestamp - start : 0n;
  if (t <= initial) return balance;
  if (t >= initial + decay) return 0n;
  return (balance * (initial + decay - t)) / decay;
}

// ===== Snapshot management =====
let baseSnapshot: string | null = null;
async function captureBaseSnapshot() {
  baseSnapshot = await rpc("evm_snapshot", []);
}

async function resetToBase(label: string) {
  if (!baseSnapshot) {
    await captureBaseSnapshot();
    return;
  }
  await rpc("evm_revert", [baseSnapshot]);
  await rpc("evm_mine", []);
  output.write(`${fmt.dim(`Reset chain state for ${label}`)}\n`);
  await captureBaseSnapshot();
}

// ===== Environment prep =====
async function ensureMockKnine(wallet: WalletClient, publicClient: PublicClient): Promise<boolean> {
  const existingCode = await publicClient.getCode({ address: KNINE });
  if (existingCode !== "0x") {
    output.write(fmt.dim("Detected existing KNINE contract; assuming fork mode.\n"));
    return false;
  }
  section("Installing mock KNINE at hardcoded address");
  const tempAddress = await deployFromArtifact(wallet, publicClient, MOCK_KNINE_ARTIFACT, [K9SAFE]);
  const runtime = await publicClient.getCode({ address: tempAddress });
  await rpc("hardhat_setCode", [KNINE, runtime]);
  await callAs(K9SAFE, KNINE, KNINE_BLACKLIST_ABI, "mint", [EXPLOITER, AMOUNT]);
  const isBlack = await readBool(KNINE, KNINE_BLACKLIST_ABI, "blacklist", [EXPLOITER]);
  if (!isBlack) {
    await callAs(K9SAFE, KNINE, KNINE_BLACKLIST_ABI, "changeBlackStatus", [[EXPLOITER]]);
  }
  verdict("Mock KNINE deployed", true, `runtime copied from ${tempAddress}`);
  return true;
}

async function topUpKeyActors() {
  await setBalance(EXPLOITER, parseEther("0.001"));
  await setBalance(K9SAFE, parseEther("1"));
}

async function logBountySnapshot(title: string, info: DeploymentInfo, publicClient: PublicClient) {
  const [ethBal, totalFunded, refundsEnabled, refundSnapshot, refundCursor, acceptedAt, finalized, knineExp, knineBridge, exploiterEth] = await Promise.all([
    publicClient.getBalance({ address: info.address }),
    readUint(info.address, BOUNTY_ABI, "totalFunded"),
    readBool(info.address, BOUNTY_ABI, "refundsEnabled"),
    readUint(info.address, BOUNTY_ABI, "refundSnapshot"),
    readUint(info.address, BOUNTY_ABI, "refundCursor"),
    readUint(info.address, BOUNTY_ABI, "acceptedAt"),
    readBool(info.address, BOUNTY_ABI, "finalized"),
    readUint(KNINE, ERC20_ABI, "balanceOf", [EXPLOITER]),
    readUint(KNINE, ERC20_ABI, "balanceOf", [SHIBARIUM_BRIDGE]),
    publicClient.getBalance({ address: EXPLOITER }),
  ]);
  output.write(`\n${fmt.bold(title)}\n`);
  output.write(`  bounty balance   : ${formatEther(ethBal)} ETH\n`);
  output.write(`  total funded     : ${formatEther(totalFunded)} ETH\n`);
  output.write(`  refunds enabled  : ${refundsEnabled}\n`);
  output.write(`  refund snapshot  : ${formatEther(refundSnapshot)} ETH\n`);
  output.write(`  refund cursor    : ${refundCursor}\n`);
  output.write(`  acceptedAt       : ${acceptedAt}\n`);
  output.write(`  finalized        : ${finalized}\n`);
  output.write(`  KNINE exploiter  : ${formatEther(knineExp)}\n`);
  output.write(`  KNINE bridge     : ${formatEther(knineBridge)}\n`);
  output.write(`  exploiter ETH    : ${formatEther(exploiterEth)}\n`);
}

async function logFunders(
  bounty: Address,
  funders: Array<{ address: Address; label: string }>,
  publicClient: PublicClient
) {
  if (!funders.length) return;
  const totalFunded = await readUint(bounty, BOUNTY_ABI, "totalFunded");
  output.write(`\n  Funders:\n`);
  for (const f of funders) {
    const contributed = await readUint(bounty, BOUNTY_ABI, "fundedAmounts", [f.address]);
    const pct = formatPct(contributed, totalFunded);
    const ethAmount = formatEther(contributed);
    output.write(`    • ${f.label.padEnd(12)} ${ethAmount} ETH (${pct})\n`);
  }
}

async function safeBatchRecover(bounty: Address) {
  const wasBlack = await readBool(KNINE, KNINE_BLACKLIST_ABI, "blacklist", [EXPLOITER]);
  await setAutomine(false);
  try {
    if (wasBlack) {
      await callAs(K9SAFE, KNINE, KNINE_BLACKLIST_ABI, "changeBlackStatus", [[EXPLOITER]]);
    }
    await callAs(K9SAFE, bounty, BOUNTY_ABI, "recoverKnine", []);
  } finally {
    if (wasBlack) {
      await callAs(K9SAFE, KNINE, KNINE_BLACKLIST_ABI, "changeBlackStatus", [[EXPLOITER]]);
    }
    await rpc("evm_mine", []);
    await setAutomine(true);
  }
}

async function expectRevert(task: () => Promise<void>, label: string, expectedReason?: string) {
  let reason: string | undefined;
  let context: CallContext | undefined;
  try {
    await task();
    verdict(label, false, "did not revert");
    return;
  } catch (err: any) {
    reason = err?.reason ?? extractRevert(err);
    context = err?.context as CallContext | undefined;
    const matches = expectedReason ? reason?.includes(expectedReason) : true;
    const notes: string[] = [];
    if (reason) notes.push(`reason: ${reason}`);
    if (context?.functionName) {
      const args = context.args ? context.args.map(formatCallArg).join(", ") : "";
      notes.push(`call: ${context.functionName}(${args})`);
    } else if (context?.label) {
      notes.push(`call: ${context.label}`);
    }
    verdict(label, matches, notes.join(" | "));
    if (!matches && err?.message) {
      output.write(`${fmt.dim(err.message)}\n`);
    }
  }
}

interface ScriptContext {
  publicClient: PublicClient;
  wallets: WalletClient[];
  rl: readline.Interface;
}

// ===== Flow implementations =====
async function flowA(ctx: ScriptContext) {
  banner("Flow A – Scenario S1: Single funder, no accept, recover during INITIAL");
  await resetToBase("Flow A");
  const [deployer, funder] = ctx.wallets;
  const deployment = await deployBounty(deployer, ctx.publicClient);
  step(`Deployed bounty at ${deployment.address}`);

  await funder.sendTransaction({ to: deployment.address, value: parseEther("10") });
  verdict("funder contributed 10 ETH", true);

  await callAs(EXPLOITER, KNINE, ERC20_ABI, "approve", [deployment.address, AMOUNT]);
  verdict("exploiter allowance set", true);

  const balanceBefore = await ctx.publicClient.getBalance({ address: deployment.address });
  const now = await getNowTs();
  const expectedPayout = payoutAt(balanceBefore, now, deployment.start, deployment.initial, deployment.decay);
  const knineExpBefore = await readUint(KNINE, ERC20_ABI, "balanceOf", [EXPLOITER]);
  const knineBridgeBefore = await readUint(KNINE, ERC20_ABI, "balanceOf", [SHIBARIUM_BRIDGE]);
  const exploiterEthBefore = await ctx.publicClient.getBalance({ address: EXPLOITER });
  await safeBatchRecover(deployment.address);

  const refundSnapshot = await readUint(deployment.address, BOUNTY_ABI, "refundSnapshot");
  const finalized = await readBool(deployment.address, BOUNTY_ABI, "finalized");
  const refundsEnabled = await readBool(deployment.address, BOUNTY_ABI, "refundsEnabled");
  const knineExpAfter = await readUint(KNINE, ERC20_ABI, "balanceOf", [EXPLOITER]);
  const knineBridgeAfter = await readUint(KNINE, ERC20_ABI, "balanceOf", [SHIBARIUM_BRIDGE]);
  const exploiterEthAfter = await ctx.publicClient.getBalance({ address: EXPLOITER });
  const expDelta = knineExpBefore - knineExpAfter;
  const bridgeDelta = knineBridgeAfter - knineBridgeBefore;
  const exploiterEthDelta = exploiterEthAfter - exploiterEthBefore;
  const paid = balanceBefore - refundSnapshot;
  verdict("bounty finalized", finalized);
  verdict("refunds enabled", refundsEnabled);
  verdict("payout equals expected", finalized && paid === expectedPayout, `paid ${formatEther(paid)} ETH`);
  verdict(
    "KNINE transferred to bridge",
    finalized && expDelta === AMOUNT && bridgeDelta === AMOUNT,
    `exploiter Δ ${formatEther(expDelta)} | bridge Δ ${formatEther(bridgeDelta)}`
  );
  verdict("exploiter received ETH payout", finalized && exploiterEthDelta === paid, `Δ ${formatEther(exploiterEthDelta)} ETH`);

  await logBountySnapshot("Flow A snapshot", deployment, ctx.publicClient);
  await logFunders(
    deployment.address,
    [{ address: ctx.wallets[1].account.address as Address, label: "Funder A" }],
    ctx.publicClient
  );

  if (finalized && refundsEnabled) {
    await callAs(K9SAFE, deployment.address, BOUNTY_ABI, "refundBatch", [1n]);
    const owedAfterBatch = await readUint(deployment.address, BOUNTY_ABI, "refundOwed", [ctx.wallets[1].account.address as Address]);
    verdict("refund owed after 100% payout", owedAfterBatch === 0n);
    await expectRevert(
      () => callWithWallet(ctx.wallets[1], ctx.publicClient, deployment.address, BOUNTY_ABI, "claimRefund", []),
      "claimRefund reverts when nothing due",
      "NOTHING_DUE"
    );
  } else {
    output.write(fmt.dim("Skipping refund verification because bounty did not finalize or refunds remain disabled.\n"));
  }
}

async function flowB(ctx: ScriptContext) {
  banner("Flow B – Scenario S2: Two funders, accept in INITIAL, top-up after accept");
  await resetToBase("Flow B");
  const [deployer, funderA, funderB] = ctx.wallets;
  const deployment = await deployBounty(deployer, ctx.publicClient);
  await funderA.sendTransaction({ to: deployment.address, value: parseEther("7") });
  await funderB.sendTransaction({ to: deployment.address, value: parseEther("3") });
  const initialFunded = await readUint(deployment.address, BOUNTY_ABI, "totalFunded");
  verdict("multi-funder total is 10 ETH", initialFunded === parseEther("10"));

  await callAs(EXPLOITER, KNINE, ERC20_ABI, "approve", [deployment.address, AMOUNT]);
  await callAs(EXPLOITER, deployment.address, BOUNTY_ABI, "accept", []);
  const acceptedAt = await readUint(deployment.address, BOUNTY_ABI, "acceptedAt");
  verdict("accept() recorded", acceptedAt > 0n, `acceptedAt = ${acceptedAt}`);

  await funderA.sendTransaction({ to: deployment.address, value: parseEther("2") });
  verdict("post-accept top-up captured", true);

  const balanceBefore = await ctx.publicClient.getBalance({ address: deployment.address });
  const expectedPayout = payoutAt(balanceBefore, acceptedAt, deployment.start, deployment.initial, deployment.decay);
  const knineExpBefore = await readUint(KNINE, ERC20_ABI, "balanceOf", [EXPLOITER]);
  const knineBridgeBefore = await readUint(KNINE, ERC20_ABI, "balanceOf", [SHIBARIUM_BRIDGE]);
  const exploiterEthBefore = await ctx.publicClient.getBalance({ address: EXPLOITER });
  await safeBatchRecover(deployment.address);
  const refundSnapshot = await readUint(deployment.address, BOUNTY_ABI, "refundSnapshot");
  const paid = balanceBefore - refundSnapshot;
  const finalized = await readBool(deployment.address, BOUNTY_ABI, "finalized");
  const refundsEnabled = await readBool(deployment.address, BOUNTY_ABI, "refundsEnabled");
  const knineExpAfter = await readUint(KNINE, ERC20_ABI, "balanceOf", [EXPLOITER]);
  const knineBridgeAfter = await readUint(KNINE, ERC20_ABI, "balanceOf", [SHIBARIUM_BRIDGE]);
  const exploiterEthAfter = await ctx.publicClient.getBalance({ address: EXPLOITER });
  const expDelta = knineExpBefore - knineExpAfter;
  const bridgeDelta = knineBridgeAfter - knineBridgeBefore;
  const exploiterEthDelta = exploiterEthAfter - exploiterEthBefore;
  verdict("bounty finalized", finalized);
  verdict("refunds enabled", refundsEnabled);
  verdict(
    "payout locked to acceptance ratio",
    finalized && paid === expectedPayout,
    `paid ${formatEther(paid)} vs expected ${formatEther(expectedPayout)}`
  );
  verdict(
    "KNINE transferred to bridge",
    finalized && expDelta === AMOUNT && bridgeDelta === AMOUNT,
    `exploiter Δ ${formatEther(expDelta)} | bridge Δ ${formatEther(bridgeDelta)}`
  );
  verdict("exploiter received ETH payout", finalized && exploiterEthDelta === paid, `Δ ${formatEther(exploiterEthDelta)} ETH`);
  await logBountySnapshot("Flow B snapshot", deployment, ctx.publicClient);
  await logFunders(
    deployment.address,
    [
      { address: ctx.wallets[1].account.address as Address, label: "Funder A" },
      { address: ctx.wallets[2].account.address as Address, label: "Funder B" },
    ],
    ctx.publicClient
  );
}

async function flowC(ctx: ScriptContext) {
  banner("Flow C – Scenario S3: Accept mid-DECAY, extra funding, delayed recovery");
  await resetToBase("Flow C");
  const [deployer, f1, f2, f3] = ctx.wallets;
  const deployment = await deployBounty(deployer, ctx.publicClient);
  await f1.sendTransaction({ to: deployment.address, value: parseEther("4") });
  await f2.sendTransaction({ to: deployment.address, value: parseEther("3") });
  await f3.sendTransaction({ to: deployment.address, value: parseEther("2") });

  await increaseTime(INITIAL_PERIOD / 2n + DECAY_PERIOD / 2n);
  await callAs(EXPLOITER, KNINE, ERC20_ABI, "approve", [deployment.address, AMOUNT]);
  await callAs(EXPLOITER, deployment.address, BOUNTY_ABI, "accept", []);
  const acceptedAt = await readUint(deployment.address, BOUNTY_ABI, "acceptedAt");
  verdict("accept() after entering decay", acceptedAt > deployment.start + deployment.initial);

  await f3.sendTransaction({ to: deployment.address, value: parseEther("1.5") });
  await increaseTime(2n * 24n * 60n * 60n);
  const balanceBefore = await ctx.publicClient.getBalance({ address: deployment.address });
  const expectedPayout = payoutAt(balanceBefore, acceptedAt, deployment.start, deployment.initial, deployment.decay);
  const knineExpBefore = await readUint(KNINE, ERC20_ABI, "balanceOf", [EXPLOITER]);
  const knineBridgeBefore = await readUint(KNINE, ERC20_ABI, "balanceOf", [SHIBARIUM_BRIDGE]);
  const exploiterEthBefore = await ctx.publicClient.getBalance({ address: EXPLOITER });
  await safeBatchRecover(deployment.address);
  const refundSnapshot = await readUint(deployment.address, BOUNTY_ABI, "refundSnapshot");
  const knineExpAfter = await readUint(KNINE, ERC20_ABI, "balanceOf", [EXPLOITER]);
  const knineBridgeAfter = await readUint(KNINE, ERC20_ABI, "balanceOf", [SHIBARIUM_BRIDGE]);
  const paid = balanceBefore - refundSnapshot;
  const finalized = await readBool(deployment.address, BOUNTY_ABI, "finalized");
  const refundsEnabled = await readBool(deployment.address, BOUNTY_ABI, "refundsEnabled");
  const expDelta = knineExpBefore - knineExpAfter;
  const bridgeDelta = knineBridgeAfter - knineBridgeBefore;
  const exploiterEthAfter = await ctx.publicClient.getBalance({ address: EXPLOITER });
  const exploiterEthDelta = exploiterEthAfter - exploiterEthBefore;
  verdict("bounty finalized", finalized);
  verdict("refunds enabled", refundsEnabled);
  verdict("partial payout respected", finalized && paid === expectedPayout, `paid ${formatEther(paid)} ETH`);
  verdict(
    "KNINE transferred to bridge",
    finalized && expDelta === AMOUNT && bridgeDelta === AMOUNT,
    `exploiter Δ ${formatEther(expDelta)} | bridge Δ ${formatEther(bridgeDelta)}`
  );
  verdict("exploiter received ETH payout", finalized && exploiterEthDelta === paid, `Δ ${formatEther(exploiterEthDelta)} ETH`);
  await logBountySnapshot("Flow C snapshot", deployment, ctx.publicClient);
  await logFunders(
    deployment.address,
    [
      { address: ctx.wallets[1].account.address as Address, label: "Funder A" },
      { address: ctx.wallets[2].account.address as Address, label: "Funder B" },
      { address: ctx.wallets[3].account.address as Address, label: "Funder C" },
    ],
    ctx.publicClient
  );
}

async function flowD(ctx: ScriptContext) {
  banner("Flow D – Scenario S4: Five funders, live decay recovery, batched refunds");
  await resetToBase("Flow D");
  const [deployer, ...funders] = ctx.wallets;
  const deployment = await deployBounty(deployer, ctx.publicClient);
  const contributions = ["5", "3", "2", "1.5", "1"];
  for (let i = 0; i < 5; i++) {
    await funders[i].sendTransaction({ to: deployment.address, value: parseEther(contributions[i]) });
  }
  verdict("five funders recorded", (await readUint(deployment.address, BOUNTY_ABI, "totalFunded")) === parseEther("12.5"));

  await increaseTime(INITIAL_PERIOD + DECAY_PERIOD / 3n);
  await callAs(EXPLOITER, KNINE, ERC20_ABI, "approve", [deployment.address, AMOUNT]);
  const balanceBefore = await ctx.publicClient.getBalance({ address: deployment.address });
  const now = await getNowTs();
  const expected = payoutAt(balanceBefore, now, deployment.start, deployment.initial, deployment.decay);
  const knineExpBefore = await readUint(KNINE, ERC20_ABI, "balanceOf", [EXPLOITER]);
  const knineBridgeBefore = await readUint(KNINE, ERC20_ABI, "balanceOf", [SHIBARIUM_BRIDGE]);
  const exploiterEthBefore = await ctx.publicClient.getBalance({ address: EXPLOITER });
  await safeBatchRecover(deployment.address);
  const refundSnapshot = await readUint(deployment.address, BOUNTY_ABI, "refundSnapshot");
  const knineExpAfter = await readUint(KNINE, ERC20_ABI, "balanceOf", [EXPLOITER]);
  const knineBridgeAfter = await readUint(KNINE, ERC20_ABI, "balanceOf", [SHIBARIUM_BRIDGE]);
  const paid = balanceBefore - refundSnapshot;
  const finalized = await readBool(deployment.address, BOUNTY_ABI, "finalized");
  const refundsEnabled = await readBool(deployment.address, BOUNTY_ABI, "refundsEnabled");
  const expDelta = knineExpBefore - knineExpAfter;
  const bridgeDelta = knineBridgeAfter - knineBridgeBefore;
  const exploiterEthAfter = await ctx.publicClient.getBalance({ address: EXPLOITER });
  const exploiterEthDelta = exploiterEthAfter - exploiterEthBefore;
  verdict("bounty finalized", finalized);
  verdict("refunds enabled", refundsEnabled);
  verdict("decay payout applied", finalized && paid === expected);
  verdict(
    "KNINE transferred to bridge",
    finalized && expDelta === AMOUNT && bridgeDelta === AMOUNT,
    `exploiter Δ ${formatEther(expDelta)} | bridge Δ ${formatEther(bridgeDelta)}`
  );
  verdict("exploiter received ETH payout", finalized && exploiterEthDelta === paid, `Δ ${formatEther(exploiterEthDelta)} ETH`);

  if (finalized && refundsEnabled) {
    await callAs(K9SAFE, deployment.address, BOUNTY_ABI, "refundBatch", [3n]);
    await callAs(K9SAFE, deployment.address, BOUNTY_ABI, "refundBatch", [5n]);
    const cursor = await readUint(deployment.address, BOUNTY_ABI, "refundCursor");
    verdict("all funders processed", cursor === 5n);
  } else {
    output.write(fmt.dim("Skipping refund batching because bounty is not finalized or refunds remain disabled.") + "\n");
  }
  await logBountySnapshot("Flow D snapshot", deployment, ctx.publicClient);
  await logFunders(
    deployment.address,
    [
      { address: ctx.wallets[1].account.address as Address, label: "Funder A" },
      { address: ctx.wallets[2].account.address as Address, label: "Funder B" },
      { address: ctx.wallets[3].account.address as Address, label: "Funder C" },
      { address: ctx.wallets[4].account.address as Address, label: "Funder D" },
      { address: ctx.wallets[5].account.address as Address, label: "Funder E" },
    ],
    ctx.publicClient
  );
}

async function flowE(ctx: ScriptContext) {
  banner("Flow E – Scenario S5 & S8: Expiry refunds and pull-claim fallback");
  await resetToBase("Flow E");
  const [deployer, f1, f2] = ctx.wallets;
  const deployment = await deployBounty(deployer, ctx.publicClient);
  await f1.sendTransaction({ to: deployment.address, value: parseEther("4") });
  await f2.sendTransaction({ to: deployment.address, value: parseEther("2") });

  const reverter = await deployFromArtifact(deployer, ctx.publicClient, RECEIVER_REVERT_ARTIFACT, []);
  await setBalance(reverter, parseEther("3"));
  await sendAs(reverter, deployment.address, parseEther("1.5"), undefined, {
    label: "reverter -> bounty funding",
  });
  verdict("reverting funder contributed", true, `address ${reverter}`);

  await increaseTime(INITIAL_PERIOD + DECAY_PERIOD + 1n);
  await expectRevert(
    async () => callAs(EXPLOITER, deployment.address, BOUNTY_ABI, "accept", []),
    "accept() after expiry reverts",
    "TOO_LATE"
  );

  await callAs(K9SAFE, deployment.address, BOUNTY_ABI, "refundBatch", [4n]);
  await callAs(K9SAFE, deployment.address, BOUNTY_ABI, "refundBatch", [4n]);
  const owedBefore = await readUint(deployment.address, BOUNTY_ABI, "refundOwed", [reverter]);
  verdict("push failure credited to owed", owedBefore > 0n, `owed ${formatEther(owedBefore)} ETH`);

  await expectRevert(
    async () => callAs(K9SAFE, deployment.address, BOUNTY_ABI, "refundBatch", [0n]),
    "refundBatch(0) reverts",
    "BAD_BATCH_SIZE"
  );

  await callAs(reverter, reverter, RECEIVER_REVERT_ABI, "setRevertOnReceive", [false]);
  await callAs(reverter, deployment.address, BOUNTY_ABI, "claimRefund", []);
  const owedAfter = await readUint(deployment.address, BOUNTY_ABI, "refundOwed", [reverter]);
  verdict("pull claim clears owed", owedAfter === 0n);

  await callWithWallet(f1, ctx.publicClient, reverter, RECEIVER_REVERT_ABI, "claim", []);
  verdict("contract forwarded funds via claim()", true);

  await logBountySnapshot("Flow E snapshot", deployment, ctx.publicClient);
  await logFunders(
    deployment.address,
    [
      { address: ctx.wallets[1].account.address as Address, label: "Funder A" },
      { address: ctx.wallets[2].account.address as Address, label: "Funder B" },
      { address: reverter, label: "Reverter" },
    ],
    ctx.publicClient
  );
}

async function flowF(ctx: ScriptContext) {
  banner("Flow F – Scenario S6 & S7: Negative acceptance and recovery cases");
  const [deployer, funder] = ctx.wallets;

  // Accept too late
  await resetToBase("Flow F – late accept");
  const bountyLate = await deployBounty(deployer, ctx.publicClient);
  await funder.sendTransaction({ to: bountyLate.address, value: parseEther("2") });
  await increaseTime(INITIAL_PERIOD + DECAY_PERIOD + 5n);
  await expectRevert(
    async () => callAs(EXPLOITER, bountyLate.address, BOUNTY_ABI, "accept", []),
    "accept() after window",
    "TOO_LATE"
  );

  // Recover without un-blacklisting
  await resetToBase("Flow F – missing unblacklist");
  const bountyLocked = await deployBounty(deployer, ctx.publicClient);
  await funder.sendTransaction({ to: bountyLocked.address, value: parseEther("3") });
  await callAs(EXPLOITER, KNINE, ERC20_ABI, "approve", [bountyLocked.address, AMOUNT]);
  await expectRevert(
    async () => callAs(K9SAFE, bountyLocked.address, BOUNTY_ABI, "recoverKnine", []),
    "recover without un-blacklisting",
    "TRANSFER_FAIL"
  );

  // Allowance revoked after accept
  await resetToBase("Flow F – allowance revoked");
  const bountyRevoked = await deployBounty(deployer, ctx.publicClient);
  await funder.sendTransaction({ to: bountyRevoked.address, value: parseEther("3") });
  await callAs(EXPLOITER, KNINE, ERC20_ABI, "approve", [bountyRevoked.address, AMOUNT]);
  await callAs(EXPLOITER, bountyRevoked.address, BOUNTY_ABI, "accept", []);
  await callAs(EXPLOITER, KNINE, ERC20_ABI, "approve", [bountyRevoked.address, 0n]);
  await expectRevert(
    async () => safeBatchRecover(bountyRevoked.address),
    "recover with zero allowance",
    "TRANSFER_FAIL"
  );
}

// ===== Main entrypoint =====
async function main() {
  const rl = readline.createInterface({ input, output });
  const argv = process.argv.slice(2);
  PAUSE_ENABLED = !(process.env.NO_PAUSE === "1" || argv.includes("--no-pause"));

  output.write("🧪  Interactive KnineRecoveryBountyDecayAcceptMultiFunder scenario runner\n");

  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const wallets = await viem.getWalletClients();
  if (wallets.length < 6) {
    throw new Error("Need at least six configured wallet clients for scripted funders");
  }

  await ensureMockKnine(wallets[0], publicClient);
  await topUpKeyActors();
  await captureBaseSnapshot();

  const ctx: ScriptContext = { publicClient, wallets, rl };
  const flows = [flowA, flowB, flowC, flowD, flowE, flowF];

  for (const run of flows) {
    await run(ctx);
    await pause(rl, "Flow complete");
  }

  output.write("\nAll labelled flows executed.\n");
  rl.close();
}

main().catch((err) => {
  if (err && (err as any).isCallError) {
    printCallError(err);
  } else {
    console.error(err);
  }
  if (err && (err as any).cause && process.env.DEBUG_REVERTS === "1") {
    console.error((err as any).cause);
  }
  process.exit(1);
});
