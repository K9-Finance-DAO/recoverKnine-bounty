/**
 * Interactive, verbose mainnet-fork test runner for KnineRecoveryBountyDecayAccept.
 *
 * - Pauses after every sub-step for Enter key.
 * - Extremely verbose logging of state, balances, events, and expectations.
 * - Uses Hardhat network methods (impersonation, time travel) against a running fork or an in-process simulated network.
 *
 * Usage examples:
 *   - Start a forked node, then run the script (connect to localhost RPC):
 *       pnpm fork:mainnet
 *       hardhat run --network localhost scripts/interactive-bounty-fork.ts
 *   - Or run directly on an in-process simulated network and reset fork via hardhat_reset in this script.
 *
 * Env vars (optional):
 *   - BOUNTY_ADDRESS: mainnet bounty contract address
 *   - KNINE_BLACKLISTER: address that can unblacklist the exploiter (optional)
 *   - FUNDING_ETH: ETH to send to bounty per test, e.g., "10"
 */

import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { network } from "hardhat";
import { Address, Hex, encodeFunctionData, formatEther, getAddress, isAddress, parseAbi, parseEther, parseGwei } from "viem";

// Minimal ERC20 ABI for allowance/approve/balanceOf/transferFrom
const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transferFrom(address,address,uint256) returns (bool)",
]);

// KNINE blacklist relevant ABI based on provided interface
const KNINE_BLACKLIST_ABI = parseAbi([
  "function blacklist(address) view returns (bool)",
  "function changeBlackStatus(address[] users)",
]);

function asHex(v: bigint): Hex {
  return (`0x${v.toString(16)}`) as Hex;
}

let PAUSE_ENABLED = true;
async function pause(rl: readline.Interface, msg: string) {
  output.write(`\n⏸️  ${msg}\n`);
  if (!PAUSE_ENABLED) return;
  await rl.question("Press Enter to continue...");
}

async function impersonate(addr: Address) {
  await rpc("hardhat_impersonateAccount", [addr]);
}

async function stopImpersonate(addr: Address) {
  await rpc("hardhat_stopImpersonatingAccount", [addr]);
}

async function feeFields(): Promise<{ maxFeePerGas: Hex; maxPriorityFeePerGas: Hex }> {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const block = await publicClient.getBlock();
  const base = block.baseFeePerGas ?? parseGwei("1");
  const prio = process.env.PRIORITY_GWEI ? parseGwei(process.env.PRIORITY_GWEI) : parseGwei("2");
  const maxFee = base * 2n + prio; // headroom above next base fee
  return { maxFeePerGas: asHex(maxFee), maxPriorityFeePerGas: asHex(prio) };
}

function gasLimitHex(): Hex {
  const n = BigInt(process.env.GAS_LIMIT || "5000000");
  return asHex(n);
}

async function sendAs(from: Address, to: Address, value: bigint, data?: Hex) {
  // Build base tx
  const baseTx: any = { from, to, value: asHex(value), data };
  const fees = await feeFields();

  // Estimate gas with a safety buffer; fallback to env GAS_LIMIT if estimation fails
  let gasLimit: bigint;
  try {
    const estHex: string = await rpc("eth_estimateGas", [baseTx]);
    const est = BigInt(estHex);
    // Add 20% safety margin
    gasLimit = (est * 12n) / 10n;
  } catch (_) {
    gasLimit = BigInt(process.env.GAS_LIMIT || "5000000");
    output.write(`⚠️  eth_estimateGas failed; falling back to GAS_LIMIT=${gasLimit}\n`);
  }

  // Ensure sender has enough ETH for value + max upfront gas
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const bal = await publicClient.getBalance({ address: from });
  const maxFeePerGas = BigInt(fees.maxFeePerGas);
  const needed = value + gasLimit * maxFeePerGas;
  if (bal < needed) {
    const topUp = needed; // set exact required amount
    try {
      await rpc("hardhat_setBalance", [from, asHex(topUp)]);
      output.write(`⛽ Auto-top-up ${from} via hardhat_setBalance to cover gas (needed ${formatEther(needed)}).\n`);
    } catch {
      // If we can't top-up, proceed and let the tx fail fast with a clear error
      output.write("⚠️  hardhat_setBalance not supported; proceeding without gas top-up.\n");
    }
  }

  await impersonate(from);
  try {
    await rpc("eth_sendTransaction", [{ ...baseTx, gas: asHex(gasLimit), ...fees }]);
  } finally {
    await stopImpersonate(from);
  }
}

async function callAs(from: Address, to: Address, abi: any, functionName: string, args: readonly unknown[] = [], value?: bigint) {
  const data = encodeFunctionData({ abi, functionName, args });
  await sendAs(from, to, value ?? 0n, data);
}

async function setNextTimestamp(ts: bigint) {
  await rpc("evm_setNextBlockTimestamp", [Number(ts)]);
  await rpc("evm_mine", []);
}

async function increaseTime(seconds: bigint) {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const block = await publicClient.getBlock();
  await setNextTimestamp(block.timestamp + seconds);
}

function pctStr(n: bigint, d: bigint): string {
  if (d === 0n) return "—";
  // Show with 2 decimal places
  const scaled = (n * 10_000n) / d; // 2 decimals
  const intPart = scaled / 100n;
  const frac = (scaled % 100n).toString().padStart(2, "0");
  return `${intPart}.${frac}%`;
}

function payoutAt(balance: bigint, nowTs: bigint, start: bigint, initial: bigint, decay: bigint): bigint {
  const t = nowTs > start ? nowTs - start : 0n;
  if (t <= initial) return balance;
  if (t >= initial + decay) return 0n;
  return (balance * (initial + decay - t)) / decay;
}

function fmtUtc(ts: bigint | number): string {
  const n = typeof ts === "bigint" ? Number(ts) : ts;
  const d = new Date(n * 1000);
  // Format like YYYY-MM-DD HH:mm:ss UTC
  const iso = d.toISOString(); // e.g., 2025-01-01T12:34:56.000Z
  return iso.replace("T", " ").replace(".000Z", " UTC");
}

function printHeader(title: string) {
  const width = 80;
  const padding = Math.max(0, width - title.length - 4);
  const leftPad = Math.floor(padding / 2);
  const rightPad = padding - leftPad;
  output.write("\n");
  output.write("═".repeat(width) + "\n");
  output.write("║" + " ".repeat(leftPad) + "  " + title + "  " + " ".repeat(rightPad) + "║\n");
  output.write("═".repeat(width) + "\n");
}

function printSubHeader(title: string) {
  const width = 80;
  const padding = Math.max(0, width - title.length - 4);
  const leftPad = Math.floor(padding / 2);
  const rightPad = padding - leftPad;
  output.write("\n");
  output.write(" " + "─".repeat(width) + "\n");
  output.write("│" + " ".repeat(leftPad) + "  " + title + "  " + " ".repeat(rightPad) + "│\n");
  output.write(" " + "─".repeat(width) + "\n");
}

function printSeparator() {
  output.write("\n" + "▪".repeat(80) + "\n");
}

async function readErc20Balance(token: Address, holder: Address): Promise<bigint> {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  return await publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: "balanceOf", args: [holder] });
}

async function readErc20Allowance(token: Address, owner: Address, spender: Address): Promise<bigint> {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  return await publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: "allowance", args: [owner, spender] });
}

async function getNowTs(): Promise<bigint> {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const blk = await publicClient.getBlock();
  return blk.timestamp;
}

async function rpc(method: string, params: any[] = []) {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const transport: any = (publicClient as any).transport;
  if (!transport || typeof transport.request !== "function") {
    throw new Error("RPC transport not available on publicClient");
  }
  return await transport.request({ method, params });
}

let rootSnapshot: any | null = null;
async function takeSnapshot() {
  const id = await rpc("evm_snapshot", []);
  return id;
}

async function resetChain(context?: string) {
  if (rootSnapshot == null) {
    rootSnapshot = await takeSnapshot();
    output.write(`Created base snapshot ${rootSnapshot} for resets.\n`);
  } else {
    try {
      await rpc("evm_revert", [rootSnapshot]);
      output.write(`Reverted to base snapshot ${rootSnapshot}${context ? ` (${context})` : ""}.\n`);
    } catch (e: any) {
      output.write(`evm_revert failed (${e?.message || e}); attempting hardhat_reset as fallback...\n`);
      try {
        await rpc("hardhat_reset", []);
      } catch (_) {
        output.write("hardhat_reset not supported; continuing without full reset.\n");
      }
    }
  }
  // establish a fresh baseline for next resets
  rootSnapshot = await takeSnapshot();
  output.write(`New base snapshot ${rootSnapshot} captured.\n`);
  // Mine one block to ensure any providers/watchers refresh post-reset
  try { await rpc("evm_mine", []); } catch (_) {}
}

async function tryUnblacklist(
  rl: readline.Interface,
  token: Address,
  caller: Address,
  exploiter: Address
): Promise<void> {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  output.write("\nChecking blacklist(EXPLOITER) on KNINE...\n");
  try {
    const isBlk = await publicClient.readContract({ address: token, abi: KNINE_BLACKLIST_ABI, functionName: "blacklist", args: [exploiter] });
    output.write(`  blacklist(${exploiter}) = ${isBlk}\n`);
    if (!isBlk) {
      output.write("Exploiter is not blacklisted; nothing to do.\n");
      return;
    }
    output.write("Calling changeBlackStatus([exploiter]) from treasury to toggle off...\n");
    await callAs(caller, token, KNINE_BLACKLIST_ABI, "changeBlackStatus", [[exploiter]]);
    const after = await publicClient.readContract({ address: token, abi: KNINE_BLACKLIST_ABI, functionName: "blacklist", args: [exploiter] });
    output.write(`  post-change blacklist(${exploiter}) = ${after}\n`);
    if (after) {
      output.write("WARNING: changeBlackStatus did not clear blacklist; manual intervention may be required.\n");
      await pause(rl, "Manually unblacklist in another terminal if needed, then continue");
    } else {
      output.write("✓ Exploiter successfully unblacklisted.\n");
    }
  } catch (e: any) {
    const msg = e?.message || String(e);
    output.write(`Failed to read or change blacklist: ${msg.split("\n")[0]}\n`);
    await pause(rl, "Manual unblacklist may be required; continue when ready");
  }
}

async function logBalances(label: string, obj: { publicClient: any; bounty: Address; treasury: Address; exploiter: Address; knine: Address; }) {
  const { publicClient, bounty, treasury, exploiter, knine } = obj;
  const [bountyEth, tresEth, expEth, tBal, eBal] = await Promise.all([
    publicClient.getBalance({ address: bounty }),
    publicClient.getBalance({ address: treasury }),
    publicClient.getBalance({ address: exploiter }),
    readErc20Balance(knine, treasury),
    readErc20Balance(knine, exploiter),
  ]);
  output.write(`\n[${label}] Balances:\n`);
  output.write(`  bounty ETH:      ${formatEther(bountyEth)}\n`);
  output.write(`  treasury ETH:    ${formatEther(tresEth)}\n`);
  output.write(`  exploiter ETH:   ${formatEther(expEth)}\n`);
  output.write(`  treasury KNINE:  ${tBal.toString()}\n`);
  output.write(`  exploiter KNINE: ${eBal.toString()}\n`);
}

function printHelp() {
  const usage = `
Usage:
  hardhat run --network <network> scripts/interactive-bounty-fork.ts -- [flags]

Flags:
  --defaults       Use env vars instead of prompts
  --all            Run all tests automatically
  --no-pause       Disable interactive pauses
  --help, -h       Show this help and exit

  Environment variables:
  BOUNTY_ADDRESS   Bounty contract address (required with --defaults)
  FUNDING_ETH      ETH to send to the bounty per test (default: 10)
  FUND_FROM        "treasury" (enforced; deployer disabled)
  KNINE_BLACKLISTER Address that can unblacklist exploiter (optional)
  PREFUND          Additive ETH top-ups before tests (default: 1 = enabled)
  PREFUND_TREASURY_ETH  Treasury top-up amount in ETH (default: 3)
  PREFUND_EXPLOITER_ETH Exploiter top-up amount in ETH (default: 0.01)
  SCRIPT_HELP      Set to 1 to print this help (useful because Hardhat consumes --help)
  DEFAULTS         Set to 1 to act like --defaults
  ALL              Set to 1 to act like --all (implies DEFAULTS)
  NO_PAUSE         Set to 1 to act like --no-pause
  PRIORITY_GWEI    Max priority fee in gwei for txs (default: 2)
  GAS_LIMIT        Gas limit to use for txs (default: 5000000)

Available tests:
  1) approve → unblacklist → recoverKnine
  2) time travel → approve → accept → unblacklist → recoverKnine
  3) approve → accept → expiry → withdraw fail → reduce approve → withdraw ok
  5) approve → accept → expiry → recoverKnine
  6) expiry → withdrawToTreasury

Examples:
  pnpm fork:mainnet
  pnpm exec hardhat run --network hardhatMainnet scripts/interactive-bounty-fork.ts -- --defaults --all
  pnpm exec hardhat run --network localhost scripts/interactive-bounty-fork.ts -- --no-pause --defaults
  SCRIPT_HELP=1 pnpm exec hardhat run --network localhost scripts/interactive-bounty-fork.ts
`;
  output.write(usage);
}

async function main() {
  const rl = readline.createInterface({ input, output });

  // Flags (parsed before any network work so --help is fast)
  const argv = process.argv.slice(2);
  if (process.env.SCRIPT_HELP === "1" || argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    rl.close();
    return;
  }
  const USE_DEFAULTS = process.env.DEFAULTS === "1" || argv.includes("--defaults");
  const RUN_ALL = USE_DEFAULTS || process.env.ALL === "1" || argv.includes("--all");
  const NO_PAUSE = process.env.NO_PAUSE === "1" || argv.includes("--no-pause");
  PAUSE_ENABLED = !NO_PAUSE;

  // Fancy header
  output.write("🧪 \x1b[1mInteractive KNINE bounty fork tests (extremely verbose)\x1b[22m\n");
  output.write("\x1b[90m=======================================================\x1b[39m\n\n");

  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();

  const defaultBounty = process.env.BOUNTY_ADDRESS || "";
  let bountyAddress = defaultBounty;
  if (!bountyAddress && !USE_DEFAULTS) {
    bountyAddress = await rl.question("Enter bounty contract address (BOUNTY_ADDRESS): ");
  }
  if (!bountyAddress && USE_DEFAULTS) {
    output.write("❌ \x1b[31mMissing BOUNTY_ADDRESS. Set env or run without --defaults to be prompted.\x1b[39m\n");
    process.exit(1);
  }
  if (!isAddress(bountyAddress)) {
    throw new Error("Invalid BOUNTY_ADDRESS");
  }
  bountyAddress = getAddress(bountyAddress);

  // Quick sanity check: ensure the address has code on this network.
  // This catches the common case of running against an in-process EVM without a fork.
  try {
    const code = await publicClient.getCode({ address: bountyAddress as Address });
    if (!code || code === "0x") {
      output.write("\n❌ Address has no contract code on the current network.\n");
      output.write("   You are likely running against an in-process network without a mainnet fork.\n");
      output.write("   Try:\n");
      output.write("     1) pnpm fork:mainnet   # requires MAINNET_RPC_URL in .env\n");
      output.write("     2) hardhat run --network localhost scripts/interactive-bounty-fork.ts\n\n");
      process.exit(1);
    }
  } catch (_) {
    // If getCode fails unexpectedly, continue and let the later read error surface.
  }

  const defaultFundingEth = process.env.FUNDING_ETH || "10";
  const fundingEthStr = USE_DEFAULTS ? defaultFundingEth : (await rl.question(`ETH to fund per test [default ${defaultFundingEth}]: `) || defaultFundingEth);
  const FUNDING_ETH = parseEther(fundingEthStr);
  const FUND_FROM_TREASURY = true; // enforce treasury-only funding (no default account txs)

  const blacklisterEnv = process.env.KNINE_BLACKLISTER || "";
  const blacklisterInput = USE_DEFAULTS ? "" : await rl.question(`KNINE blacklister/admin address (optional)${blacklisterEnv ? ` [default ${blacklisterEnv}]` : ""}: `);
  const KNINE_BLACKLISTER = (blacklisterInput || blacklisterEnv).trim();
  const blacklisterAddr = KNINE_BLACKLISTER && isAddress(KNINE_BLACKLISTER) ? (getAddress(KNINE_BLACKLISTER) as Address) : undefined;

  output.write("\nℹ️  \x1b[1mAttaching to bounty and reading constants...\x1b[22m\n");
  const bounty = await viem.getContractAt("KnineRecoveryBountyDecayAccept", bountyAddress as Address);

  const [KNINE, TREASURY, EXPLOITER, AMOUNT, START, INITIAL, DECAY, TERMS_HASH, finalized, acceptedAt] = await Promise.all([
    bounty.read.KNINE(),
    bounty.read.TREASURY(),
    bounty.read.EXPLOITER(),
    bounty.read.AMOUNT(),
    bounty.read.START(),
    bounty.read.INITIAL(),
    bounty.read.DECAY(),
    bounty.read.TERMS_HASH(),
    bounty.read.finalized(),
    bounty.read.acceptedAt(),
  ]);

  // Optional pre-test top-ups (enabled by default). Additive top-ups so "before" reflects fork + prefund.
  const PREFUND = (process.env.PREFUND ?? "1");
  const DO_PREFUND = PREFUND === "1" || PREFUND.toLowerCase() === "true";
  if (DO_PREFUND) {
    const preTreasury = process.env.PREFUND_TREASURY_ETH || "3";
    const preExploiter = process.env.PREFUND_EXPLOITER_ETH || "0.01";
    const [treBal0, expBal0] = await Promise.all([
      publicClient.getBalance({ address: TREASURY }),
      publicClient.getBalance({ address: EXPLOITER }),
    ]);
    const addTreasury = parseEther(preTreasury);
    const addExploiter = parseEther(preExploiter);
    if (addTreasury > 0n) {
      const newTre = treBal0 + addTreasury;
      output.write(`\n⛽ Prefunding treasury: +${formatEther(addTreasury)} ETH (was ${formatEther(treBal0)}) → ${formatEther(newTre)} via hardhat_setBalance...\n`);
      await rpc("hardhat_setBalance", [TREASURY, asHex(newTre)]).catch(() => output.write("hardhat_setBalance not supported; skipping.\n"));
    }
    if (addExploiter > 0n) {
      const newExp = expBal0 + addExploiter;
      output.write(`⛽ Prefunding exploiter: +${formatEther(addExploiter)} ETH (was ${formatEther(expBal0)}) → ${formatEther(newExp)} via hardhat_setBalance...\n`);
      await rpc("hardhat_setBalance", [EXPLOITER, asHex(newExp)]).catch(() => output.write("hardhat_setBalance not supported; skipping.\n"));
    }
    // Mine a block so subsequent balance reads pick up fresh values consistently
    try { await rpc("evm_mine", []); } catch (_) {}
  } else {
    output.write("\n🔄 Prefund disabled; showing true forked balances before actions. Set PREFUND=1 to enable.\n");
  }

  const nowTs = await getNowTs();
  const windowEnd = START + INITIAL + DECAY;
  output.write(`\n\x1b[1mBounty at:\x1b[22m  ${bountyAddress}\n`);
  output.write(`KNINE:      ${KNINE}\n`);
  output.write(`TREASURY:   ${TREASURY}\n`);
  output.write(`EXPLOITER:  ${EXPLOITER}\n`);
  output.write(`AMOUNT:     ${AMOUNT.toString()}\n`);
  output.write(`START:      ${START}  (unix)     | ${fmtUtc(START)}\n`);
  output.write(`INITIAL:    ${INITIAL} seconds\n`);
  output.write(`DECAY:      ${DECAY} seconds\n`);
  output.write(`WINDOW END: ${windowEnd} (unix)      | ${fmtUtc(windowEnd)}\n`);
  output.write(`NOW:        ${nowTs} (unix)      | ${fmtUtc(nowTs)}\n`);
  output.write(`TERMS_HASH: ${TERMS_HASH}\n`);
  output.write(`finalized:  ${finalized}  acceptedAt: ${acceptedAt}\n`);

  await pause(rl, "Review bounty constants above");

  // Helper closures bound to this bounty
  const logState = async (label: string) => logBalances(label, { publicClient, bounty: bountyAddress as Address, treasury: TREASURY, exploiter: EXPLOITER, knine: KNINE });

  async function fundBounty() {
    if (FUND_FROM_TREASURY) {
      output.write(`\n💸 Funding bounty with ${formatEther(FUNDING_ETH)} ETH from TREASURY ${TREASURY}...\n`);
      // ensure treasury has gas; top up balance if needed
      const treBal = await publicClient.getBalance({ address: TREASURY });
      const minGas = parseEther("0.1");
      if (treBal < FUNDING_ETH + minGas) {
        output.write("Top up treasury gas balance via hardhat_setBalance...\n");
        await rpc("hardhat_setBalance", [TREASURY, asHex(FUNDING_ETH + minGas)]).catch(() => output.write("hardhat_setBalance not supported; cannot auto-top-up.\n"));
      }
      await sendAs(TREASURY, bountyAddress as Address, FUNDING_ETH);
    } else {
      output.write("\n❌ Funding from deployer is disabled to avoid default account usage.\n");
      throw new Error("FUND_FROM must be treasury");
    }
  }

  async function ensureAllowance(amount: bigint, log_state: boolean = false) {
    printSubHeader("APPROVE TRANSACTION");
    const current = await readErc20Allowance(KNINE, EXPLOITER, bountyAddress as Address);
    output.write(`Current allowance exploiter→bounty: ${current.toString()}\n`);
    if (current >= amount) {
      output.write("Already sufficient allowance; skipping approve.\n");
      return;
    }
    output.write("\nSending approve() from exploiter...\n");
    try {
      if (log_state) {
        await logState("before approve");
      }
      await callAs(EXPLOITER, KNINE, ERC20_ABI, "approve", [bountyAddress, amount]);
      if (log_state) {
        await logState("after approve");
      }
    } catch (e: any) {
      output.write(`approve failed: ${e?.message || e}\n`);
      throw e;
    }
    const updated = await readErc20Allowance(KNINE, EXPLOITER, bountyAddress as Address);
    output.write(`Updated allowance exploiter→bounty: ${updated.toString()}\n`);
  }

  async function maybeUnblacklist() {
    const caller = TREASURY;
    await tryUnblacklist(rl, KNINE, caller, EXPLOITER);
  }

  async function tryAccept(): Promise<boolean> {
    try {
      printSubHeader("ACCEPT TRANSACTION");
      await logState("before accept");
      await pause(rl, "🤝 Exploiter calling accept()");
      await callAs(EXPLOITER, bountyAddress as Address, bounty.abi, "accept", []);
      await logState("after accept");
      const a = await bounty.read.acceptedAt();
      output.write(`✅ accept() OK. acceptedAt=${a} | ${fmtUtc(a)}\n`);
      return true;
    } catch (e: any) {
      const msg = e?.message || String(e);
      output.write(`accept() reverted: ${msg.split("\n")[0]}\n`);
      return false;
    }
  }

  async function callRecoverKnine(caller?: Address) {
    const anyCaller = caller ?? TREASURY;
    const fromBlock = await publicClient.getBlockNumber();
    printSubHeader("RECOVER KNINE TRANSACTION");
    await logState("before recoverKnine");
    await pause(rl, `About to call recoverKnine() from ${anyCaller}`);
    await callAs(anyCaller, bountyAddress as Address, bounty.abi, "recoverKnine", []);
    output.write("recoverKnine() sent. Waiting 1 block...\n");
    await rpc("evm_mine", []);
    await logState("after recoverKnine");
    const logs = await publicClient.getContractEvents({ address: bountyAddress as Address, abi: bounty.abi, eventName: "DealFinalized", fromBlock, strict: true });
    if (logs.length > 0) {
      const ev = logs[0] as any;
      output.write(`DealFinalized: exploiter=${ev.args.exploiter} paidEth=${formatEther(ev.args.paidEth)} termsHash=${ev.args.termsHash}\n`);
    } else {
      output.write("No DealFinalized event found in recent blocks.\n");
    }
  }

  async function callWithdrawToTreasury(expectRevertSubstring?: string) {
    try {
      printSubHeader("WITHDRAW TO TREASURY TRANSACTION");
      await logState("before withdrawToTreasury");
      await pause(rl, "About to call withdrawToTreasury() from TREASURY");
      await callAs(TREASURY, bountyAddress as Address, bounty.abi, "withdrawToTreasury", []);
      await logState("after withdrawToTreasury");
      output.write("withdrawToTreasury() succeeded.\n");
    } catch (e: any) {
      const msg = e?.message || String(e);
      output.write(`withdrawToTreasury() reverted:\n${msg}\n`);
      if (expectRevertSubstring) {
        output.write(`Expected revert reason: "${expectRevertSubstring}"\n`);
        if (msg.includes(expectRevertSubstring)) {
          output.write("✅ Revert matched expectation.\n");
          return;
        } else {
          output.write(`❌ WARNING: Revert did not match expected reason.\n`);
          output.write(`   Expected substring: "${expectRevertSubstring}"\n`);
          output.write(`   Actual error: "${msg}"\n`);
        }
      } else {
        throw e;
      }
    }
  }

  async function setAutomine(enabled: boolean) {
    await rpc("evm_setAutomine", [enabled]);
  }

  // ================================
  // SAFE MULTICALL (SIMULATION)
  // This function simulates executing the following TREASURY-only actions in a
  // single block (like a Gnosis Safe multicall):
  //   1) KNINE.changeBlackStatus([EXPLOITER])  // unblacklist if needed
  //   2) Bounty.recoverKnine()
  //   3) KNINE.changeBlackStatus([EXPLOITER])  // re-blacklist if it was on
  // It disables automine, sends the three txs, then mines 1 block.
  // ================================
  async function safeBatchRecoverKnine() {
    // Simulate a Gnosis Safe-style batch by sending sequential txs from TREASURY
    // with automine disabled, then mine once so they land in a single block.
    const fromBlock = await publicClient.getBlockNumber();
    const isBlk = await publicClient.readContract({ address: KNINE, abi: KNINE_BLACKLIST_ABI, functionName: "blacklist", args: [EXPLOITER] });
    printSubHeader("SAFE BATCH: UNBLACKLIST → RECOVER → RE-BLACKLIST");
    await logState("before safe batch");
    output.write("\n🔁 Executing simulated Safe batch: [unblacklist?] → recoverKnine → [re-blacklist?]\n");
    await setAutomine(false);
    try {
      if (isBlk) {
        // Step 1: Unblacklist exploiter (toggle off)
        await callAs(TREASURY, KNINE, KNINE_BLACKLIST_ABI, "changeBlackStatus", [[EXPLOITER]]);
      }
      // Step 2: Recover KNINE and pay bounty
      await callAs(TREASURY, bountyAddress as Address, bounty.abi, "recoverKnine", []);
      if (isBlk) {
        // Step 3: Re-blacklist exploiter (toggle back on)
        await callAs(TREASURY, KNINE, KNINE_BLACKLIST_ABI, "changeBlackStatus", [[EXPLOITER]]);
      }
    } finally {
      await rpc("evm_mine", []);
      await setAutomine(true);
    }
    await logState("after safe batch");
    const logs = await publicClient.getContractEvents({ address: bountyAddress as Address, abi: bounty.abi, eventName: "DealFinalized", fromBlock, strict: true });
    if (logs.length > 0) {
      const ev = logs[0] as any;
      output.write(`DealFinalized: exploiter=${ev.args.exploiter} paidEth=${formatEther(ev.args.paidEth)} termsHash=${ev.args.termsHash}\n`);
    }
  }

  async function test1() {
    printHeader("TEST 1: Send ETH → exploiter approve → remove blacklist → recoverKnine");
    await pause(rl, "Resetting chain state to initial fork");
    await resetChain("test1");

    printSubHeader("FUNDING BOUNTY");
    await logState("before funding");
    await fundBounty();
    await logState("after funding");

    await pause(rl, "About to approve AMOUNT from exploiter to bounty");
    await ensureAllowance(AMOUNT, true);

    // Expected payout is current full balance subject to decay at now (since not accepted)
    const now = await getNowTs();
    const bal = await publicClient.getBalance({ address: bountyAddress as Address });
    const expected = payoutAt(bal, now, START, INITIAL, DECAY);
    output.write(`💰 Expected ETH payout now: ${formatEther(expected)} (balance=${formatEther(bal)})\n`);

    // SAFE MULTICALL CALLSITE (Test 1)
    await pause(rl, "🔓 About to run Safe-style batch: unblacklist → recover → re-blacklist");
    await safeBatchRecoverKnine();

    printSeparator();
  }

  async function test2() {
    printHeader("TEST 2: Send ETH → fast-forward time → exploiter approve → accept → remove blacklist → recoverKnine");
    await pause(rl, "Resetting chain state to initial fork");
    await resetChain("test2");

    printSubHeader("FUNDING BOUNTY");
    await fundBounty();
    await logState("after funding");

    printSubHeader("TIME TRAVEL TO MID-DECAY");
    const target = START + INITIAL + (DECAY / 2n);
    const cur = await getNowTs();
    if (cur < target) {
      await pause(rl, `Advancing time to mid-decay: ${target} | ${fmtUtc(target)}\n                        was: ${cur} | ${fmtUtc(cur)}`);
      await setNextTimestamp(target);
    } else {
      output.write(`Already past target ts (${cur} | ${fmtUtc(cur)} >= ${target} | ${fmtUtc(target)}); proceeding without time travel.\n`);
    }

    await ensureAllowance(AMOUNT);
    const ok = await tryAccept();
    if (!ok) output.write("WARNING: accept() failed; proceeding (recover may revert or pay using now-time if not accepted).\n");
    const acceptedNow = await bounty.read.acceptedAt();
    output.write(`✅ acceptedAt: ${acceptedNow} | ${fmtUtc(acceptedNow)}\n`);

    // Expected payout uses acceptedAt for time but current balance
    const balanceNow = await publicClient.getBalance({ address: bountyAddress as Address });
    if (acceptedNow > 0n) {
      const expected = payoutAt(balanceNow, acceptedNow, START, INITIAL, DECAY);
      output.write(`💰 Expected ETH payout (frozen): ${formatEther(expected)} of balance=${formatEther(balanceNow)}\n`);
    } else {
      output.write("accept() not set; payout will use current time.\n");
    }

    // SAFE MULTICALL CALLSITE (Test 2)
    await pause(rl, "🔓 About to run Safe-style batch: unblacklist → recover → re-blacklist");
    await safeBatchRecoverKnine();

    printSeparator();
  }
  async function test2b() {
    printHeader("TEST 2b: fast-forward → approve & accept → fast-forward → withdrawToTreasury (fail) → remove blacklist → recoverKnine");
    await pause(rl, "Resetting chain state to initial fork");
    await resetChain("test2b");

    printSubHeader("FUNDING BOUNTY");
    await fundBounty();
    await logState("after funding");

    printSubHeader("TIME TRAVEL TO MID-DECAY");
    let target = START + INITIAL + (DECAY / 2n);
    let cur = await getNowTs();
    if (cur < target) {
      await pause(rl, `Advancing time to mid-decay: ${target} | ${fmtUtc(target)}\n                        was: ${cur} | ${fmtUtc(cur)}`);
      await setNextTimestamp(target);
    } else {
      output.write(`Already past target ts (${cur} | ${fmtUtc(cur)} >= ${target} | ${fmtUtc(target)}); proceeding without time travel.\n`);
    }

    await ensureAllowance(AMOUNT);
    const ok = await tryAccept();
    if (!ok) output.write("WARNING: accept() failed; proceeding (recover may revert or pay using now-time if not accepted).\n");
    const acceptedNow = await bounty.read.acceptedAt();
    output.write(`✅ acceptedAt: ${acceptedNow} | ${fmtUtc(acceptedNow)}\n`);

    // Expected payout uses acceptedAt for time but current balance
    const balanceNow = await publicClient.getBalance({ address: bountyAddress as Address });
    if (acceptedNow > 0n) {
      const expected = payoutAt(balanceNow, acceptedNow, START, INITIAL, DECAY);
      output.write(`💰 Expected ETH payout (frozen): ${formatEther(expected)} of balance=${formatEther(balanceNow)}\n`);
    } else {
      output.write("accept() not set; payout will use current time.\n");
    }
    printSubHeader("TIME TRAVEL PAST DECAY");
    target = START + INITIAL + DECAY + 1337n;
    cur = await getNowTs();
    if (cur < target) {
      await pause(rl, `Advancing time past decay: ${target} | ${fmtUtc(target)}\n                        was: ${cur} | ${fmtUtc(cur)}`);
      await setNextTimestamp(target);
    } else {
      output.write(`Already past target ts (${cur} | ${fmtUtc(cur)} >= ${target} | ${fmtUtc(target)}); proceeding without time travel.\n`);
    }

    // try withdraw (should fail)
    await logState("before withdraw attempt");
    await callWithdrawToTreasury("LOCKED_BY_ACCEPT");
    await logState("after withdraw attempt");



    // SAFE MULTICALL CALLSITE (Test 2b)
    await pause(rl, "🔓 About to run Safe-style batch: unblacklist → recover → re-blacklist");
    await safeBatchRecoverKnine();

    // withdraw (should work)
    await logState("before withdraw");
    await callWithdrawToTreasury();
    await logState("after withdraw");

    printSeparator();
  }

  async function test3() {
    printHeader("TEST 3: Send ETH → exploiter approve → accept → fast-forward past window → withdrawToTreasury (should fail) → exploiter reduce approve → withdrawToTreasury (works)");
    await pause(rl, "Resetting chain state to initial fork");
    await resetChain("test3");

    printSubHeader("FUNDING BOUNTY");
    await fundBounty();

    await ensureAllowance(AMOUNT);
    const ok = await tryAccept();
    if (!ok) output.write("WARNING: accept() failed; expected withdrawToTreasury to be allowed after expiry (no lock).\n");

    printSubHeader("TIME TRAVEL TO EXPIRY");
    // Move beyond window
    const endTs = START + INITIAL + DECAY + 1n;
    const cur = await getNowTs();
    if (cur < endTs) {
      await pause(rl, `Advancing time to expiry+1: ${endTs} | ${fmtUtc(endTs)}\n                        was: ${cur} | ${fmtUtc(cur)}`);
      await setNextTimestamp(endTs);
    }

    await logState("before withdraw attempt");
    await callWithdrawToTreasury("LOCKED_BY_ACCEPT");

    printSubHeader("REDUCE ALLOWANCE");
    await pause(rl, "🔓 Reducing allowance to 0 from exploiter");
    await callAs(EXPLOITER, KNINE, ERC20_ABI, "approve", [bountyAddress, 0n]);

    await callWithdrawToTreasury();
    await logState("after withdrawToTreasury");

    printSeparator();
  }

  async function test5() {
    printHeader("TEST 5: Send ETH → exploiter approve → accept → fast-forward past window → recoverKnine");
    await pause(rl, "Resetting chain state to initial fork");
    await resetChain("test5");

    printSubHeader("FUNDING BOUNTY");
    await fundBounty();

    await ensureAllowance(AMOUNT);
    const ok = await tryAccept();
    const acceptedNow = ok ? await bounty.read.acceptedAt() : 0n;

    printSubHeader("TIME TRAVEL TO EXPIRY");
    // Move beyond window end
    const endTs = START + INITIAL + DECAY + 1n;
    const cur = await getNowTs();
    if (cur < endTs) {
      await pause(rl, `Advancing time to expiry+1: ${endTs} | ${fmtUtc(endTs)}\n                        was: ${cur} | ${fmtUtc(cur)}`);
      await setNextTimestamp(endTs);
    }

    const balanceNow = await publicClient.getBalance({ address: bountyAddress as Address });
    if (acceptedNow > 0n) {
      const expected = payoutAt(balanceNow, acceptedNow, START, INITIAL, DECAY);
      output.write(`Expected ETH payout (frozen): ${formatEther(expected)}\n`);
    } else {
      output.write("accept() not set; payout will use current time and may be 0 after expiry.\n");
    }

    // SAFE MULTICALL CALLSITE (Test 5)
    await pause(rl, "About to run Safe-style batch: unblacklist → recover → re-blacklist");
    await safeBatchRecoverKnine();

    printSeparator();
  }

  async function test6() {
    printHeader("TEST 6: Send ETH → fast-forward past window → withdrawToTreasury");
    await pause(rl, "Resetting chain state to initial fork");
    await resetChain("test6");

    printSubHeader("FUNDING BOUNTY");
    await fundBounty();

    printSubHeader("TIME TRAVEL TO EXPIRY");
    const endTs = START + INITIAL + DECAY + 1n;
    const cur = await getNowTs();
    if (cur < endTs) {
      await pause(rl, `Advancing time to expiry+1: ${endTs} | ${fmtUtc(endTs)}\n                        was: ${cur} | ${fmtUtc(cur)}`);
      await setNextTimestamp(endTs);
    }

    await logState("before withdrawToTreasury");
    await callWithdrawToTreasury();
    await logState("after withdrawToTreasury");

    printSeparator();
  }

  const menu = `\nChoose which tests to run (comma-separated):\n  1) approve → unblacklist → recoverKnine\n  2) time travel → approve → accept → unblacklist → recoverKnine\n  3) approve → accept → expiry → withdraw fail → reduce approve → withdraw ok\n  5) approve → accept → expiry → recoverKnine\n  6) expiry → withdrawToTreasury\n  a) all tests (1,2,3,5,6)\n`;
  const choice = RUN_ALL ? "a" : ((await rl.question(menu + "Enter selection [a]: ")).trim() || "a");
  const runAll = choice.toLowerCase() === "a";
  const toRun = new Set(runAll ? ["1", "2", "2b", "3", "5", "6"] : choice.split(",").map(s => s.trim()));

  if (toRun.has("1")) await test1();
  if (toRun.has("2")) await test2();
  if (toRun.has("2b")) await test2b();
  if (toRun.has("3")) await test3();
  if (toRun.has("5")) await test5();
  if (toRun.has("6")) await test6();

  output.write("\nDone.\n");
  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
