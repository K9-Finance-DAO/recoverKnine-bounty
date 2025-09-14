import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { Address, Hex, encodeFunctionData, parseEther, formatEther, getAbiItem, getAddress } from "viem";
import { network } from "hardhat";

const KNINE: Address = getAddress("0x91fbB2503AC69702061f1AC6885759Fc853e6EaE");
const TREASURY: Address = getAddress("0xDA4Df6E2121eDaB7c33Ed7FE0f109350939eDA84");
const EXPLOITER: Address = getAddress("0x999E025a2a0558c07DBf7F021b2C9852B367e80A");
// 248.9894 Billion * 1e18
const AMOUNT = 248989400000000000000000000000n;

async function setNextTimestamp(ts: bigint) {
  await network.provider.request({ method: "evm_setNextBlockTimestamp", params: [Number(ts)] });
  await network.provider.request({ method: "evm_mine", params: [] });
}

async function increaseTime(seconds: bigint) {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const block = await publicClient.getBlock();
  await setNextTimestamp(block.timestamp + seconds);
}

async function impersonate(addr: Address) {
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [addr] });
  await network.provider.request({ method: "hardhat_setBalance", params: [addr, "0x8AC7230489E80000"] }); // 10 ETH
}

async function stopImpersonate(addr: Address) {
  await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [addr] });
}

async function installTokenCodeFromDeployed(addressWithCode: Address) {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const code = await publicClient.getBytecode({ address: addressWithCode });
  assert(code, "no code at source address");
  await network.provider.request({ method: "hardhat_setCode", params: [KNINE, code as Hex] });
}

async function deployAndInstallToken(tokenName: "MockERC20" | "FeeOnTransferERC20" | "FalseReturnERC20") {
  const { viem } = await network.connect();
  const token = await viem.deployContract(tokenName);
  await installTokenCodeFromDeployed(token.address as Address);
  return tokenName;
}

async function callAs(from: Address, to: Address, abi: any, functionName: string, args: readonly unknown[] = [], value?: bigint) {
  const data = encodeFunctionData({ abi, functionName, args });
  await impersonate(from);
  try {
    await network.provider.request({
      method: "eth_sendTransaction",
      params: [
        {
          from,
          to,
          data,
          value: value ? `0x${value.toString(16)}` : undefined,
        },
      ],
    });
  } finally {
    await stopImpersonate(from);
  }
}

describe("KnineRecoveryBountyDecayAccept", async () => {
  const initial = 1_000n; // seconds
  const decay = 1_000n;   // seconds
  const termsHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex;

  beforeEach(async () => {
    // Fresh chain for each test
    await network.provider.request({ method: "hardhat_reset", params: [] });
  });

  it("accept: only exploiter, requires allowance, emits event, can’t be called twice or after expiry", async () => {
    const { viem } = await network.connect();
    const publicClient = await viem.getPublicClient();
    const [deployer] = await viem.getWalletClients();

    await deployAndInstallToken("MockERC20");

    const bounty = await viem.deployContract("KnineRecoveryBountyDecayAccept", [initial, decay, termsHash], { value: parseEther("10") });

    // Prepare token contract instance at KNINE address using MockERC20 ABI
    const mock = await viem.getContractAt("MockERC20", KNINE);

    // Mint tokens to exploiter but do not approve yet
    await callAs(deployer.account.address, KNINE, mock.abi, "mint", [EXPLOITER, AMOUNT]);

    // Reject non-exploiter
    await assert.rejects(
      bounty.write.accept({ account: deployer.account }),
      /ONLY_EXPLOITER/
    );

    // Reject exploiter without allowance
    await assert.rejects(
      (async () => {
        await bounty.write.accept({ account: EXPLOITER });
      })(),
      /ALLOWANCE/
    );

    // Exploiter approves allowance
    await callAs(EXPLOITER, KNINE, mock.abi, "approve", [bounty.address, AMOUNT]);

    const deploymentBlock = await publicClient.getBlockNumber();
    // Accept succeeds and emits event
    await bounty.write.accept({ account: EXPLOITER });

    const events = await publicClient.getContractEvents({ address: bounty.address, abi: bounty.abi, eventName: "Accepted", fromBlock: deploymentBlock, strict: true });
    assert.equal(events.length, 1);

    // Cannot accept twice
    await assert.rejects(
      (async () => {
        await bounty.write.accept({ account: EXPLOITER });
      })(),
      /ACK/
    );

    // Jump to expiry and verify accept is blocked
    await increaseTime(initial + decay + 1n);
    await assert.rejects(
      (async () => {
        await bounty.write.accept({ account: EXPLOITER });
      })(),
      /TOO_LATE/
    );
  });

  it("recoverKnine: pays 100% during initial, decays linearly, then expires", async () => {
    const { viem } = await network.connect();
    const publicClient = await viem.getPublicClient();
    const [deployer, anyCaller] = await viem.getWalletClients();

    await deployAndInstallToken("MockERC20");
    const mock = await viem.getContractAt("MockERC20", KNINE);

    // Deploy bounty with 10 ETH
    const bounty = await viem.deployContract("KnineRecoveryBountyDecayAccept", [initial, decay, termsHash], { value: parseEther("10") });

    // Mint and approve AMOUNT from exploiter
    await callAs(deployer.account.address, KNINE, mock.abi, "mint", [EXPLOITER, AMOUNT]);
    await callAs(EXPLOITER, KNINE, mock.abi, "approve", [bounty.address, AMOUNT]);

    // 1) During initial: payout = 100%
    const balanceBefore = await publicClient.getBalance({ address: EXPLOITER });
    await bounty.write.recoverKnine({ account: anyCaller.account });
    const balanceAfter = await publicClient.getBalance({ address: EXPLOITER });
    // Received exactly 10 ETH (caller pays gas, not recipient)
    assert.equal(balanceAfter - balanceBefore, parseEther("10"));

    // Reset chain and redo for decay check
    await network.provider.request({ method: "hardhat_reset", params: [] });
    await deployAndInstallToken("MockERC20");
    const mock2 = await viem.getContractAt("MockERC20", KNINE);
    const bounty2 = await viem.deployContract("KnineRecoveryBountyDecayAccept", [initial, decay, termsHash], { value: parseEther("10") });
    await callAs((await viem.getWalletClients())[0].account.address, KNINE, mock2.abi, "mint", [EXPLOITER, AMOUNT]);
    await callAs(EXPLOITER, KNINE, mock2.abi, "approve", [bounty2.address, AMOUNT]);

    // Jump to middle of decay
    await increaseTime(initial + decay / 2n);
    const contractBal = await publicClient.getBalance({ address: bounty2.address });
    const expectedPay = (contractBal * (initial + decay - (initial + decay / 2n))) / decay; // = 50%
    const before = await publicClient.getBalance({ address: EXPLOITER });
    await bounty2.write.recoverKnine();
    const after = await publicClient.getBalance({ address: EXPLOITER });
    assert.equal(after - before, expectedPay);

    // Reset and verify expiry: payout 0 → revert EXPIRED
    await network.provider.request({ method: "hardhat_reset", params: [] });
    await deployAndInstallToken("MockERC20");
    const mock3 = await viem.getContractAt("MockERC20", KNINE);
    const bounty3 = await viem.deployContract("KnineRecoveryBountyDecayAccept", [initial, decay, termsHash], { value: parseEther("10") });
    await callAs((await viem.getWalletClients())[0].account.address, KNINE, mock3.abi, "mint", [EXPLOITER, AMOUNT]);
    await callAs(EXPLOITER, KNINE, mock3.abi, "approve", [bounty3.address, AMOUNT]);
    await increaseTime(initial + decay + 1n);
    await assert.rejects(bounty3.write.recoverKnine(), /EXPIRED/);
  });

  it("accept freeze: payout uses frozen time but current ETH balance (top-ups after accept scale by frozen percent)", async () => {
    const { viem } = await network.connect();
    const publicClient = await viem.getPublicClient();
    const [deployer] = await viem.getWalletClients();

    await deployAndInstallToken("MockERC20");
    const mock = await viem.getContractAt("MockERC20", KNINE);
    const bounty = await viem.deployContract("KnineRecoveryBountyDecayAccept", [initial, decay, termsHash], { value: parseEther("10") });

    await callAs(deployer.account.address, KNINE, mock.abi, "mint", [EXPLOITER, AMOUNT]);
    await callAs(EXPLOITER, KNINE, mock.abi, "approve", [bounty.address, AMOUNT]);

    // Move to mid-decay and accept to freeze 50%
    await increaseTime(initial + decay / 2n);
    await bounty.write.accept({ account: EXPLOITER });

    // Top up another 10 ETH after acceptance
    await network.provider.request({
      method: "eth_sendTransaction",
      params: [{ from: deployer.account.address, to: bounty.address, value: `0x${parseEther("10").toString(16)}` }],
    });

    const bal = await publicClient.getBalance({ address: bounty.address }); // ~20 ETH
    const expectedFrozenPay = (bal * (initial + decay - (initial + decay / 2n))) / decay; // 50% of current balance

    const before = await publicClient.getBalance({ address: EXPLOITER });
    await bounty.write.recoverKnine();
    const after = await publicClient.getBalance({ address: EXPLOITER });
    assert.equal(after - before, expectedFrozenPay);
  });

  it("withdraw gating: blocked if accepted and exploiter still has allowance+balance; allowed otherwise", async () => {
    const { viem } = await network.connect();
    const publicClient = await viem.getPublicClient();
    const [deployer] = await viem.getWalletClients();

    await deployAndInstallToken("MockERC20");
    const mock = await viem.getContractAt("MockERC20", KNINE);
    const bounty = await viem.deployContract("KnineRecoveryBountyDecayAccept", [initial, decay, termsHash], { value: parseEther("10") });

    await callAs(deployer.account.address, KNINE, mock.abi, "mint", [EXPLOITER, AMOUNT]);
    await callAs(EXPLOITER, KNINE, mock.abi, "approve", [bounty.address, AMOUNT]);

    // Accept to freeze
    await bounty.write.accept({ account: EXPLOITER });

    // Advance beyond expiry
    await increaseTime(initial + decay + 1n);

    // Withdraw should be blocked
    await assert.rejects(bounty.write.withdrawToTreasury(), /LOCKED_BY_ACCEPT/);

    // Remove allowance → withdraw allowed
    await callAs(EXPLOITER, KNINE, mock.abi, "approve", [bounty.address, 0n]);
    const treasuryBefore = await publicClient.getBalance({ address: TREASURY });
    await bounty.write.withdrawToTreasury();
    const treasuryAfter = await publicClient.getBalance({ address: TREASURY });
    assert.equal(treasuryAfter - treasuryBefore > 0n, true);

    // Reset and test: acceptance with balance < AMOUNT still allows withdraw after expiry
    await network.provider.request({ method: "hardhat_reset", params: [] });
    await deployAndInstallToken("MockERC20");
    const mock2 = await viem.getContractAt("MockERC20", KNINE);
    const bounty2 = await viem.deployContract("KnineRecoveryBountyDecayAccept", [initial, decay, termsHash], { value: parseEther("5") });
    // Mint AMOUNT-1 (balance < AMOUNT)
    await callAs((await viem.getWalletClients())[0].account.address, KNINE, mock2.abi, "mint", [EXPLOITER, AMOUNT - 1n]);
    // Approve full AMOUNT (allowed even if balance < AMOUNT)
    await callAs(EXPLOITER, KNINE, mock2.abi, "approve", [bounty2.address, AMOUNT]);
    await bounty2.write.accept({ account: EXPLOITER });
    await increaseTime(initial + decay + 1n);
    const tBefore = await (await viem.getPublicClient()).getBalance({ address: TREASURY });
    await bounty2.write.withdrawToTreasury();
    const tAfter = await (await viem.getPublicClient()).getBalance({ address: TREASURY });
    assert.equal(tAfter - tBefore > 0n, true);
  });

  it("non-standard tokens: fee-on-transfer and false-return cause revert via delta check", async () => {
    const { viem } = await network.connect();
    const [deployer] = await viem.getWalletClients();

    // Fee-on-transfer scenario
    await deployAndInstallToken("FeeOnTransferERC20");
    const feeTok = await viem.getContractAt("FeeOnTransferERC20", KNINE);
    const bounty = await viem.deployContract("KnineRecoveryBountyDecayAccept", [initial, decay, termsHash], { value: parseEther("1") });
    await callAs(deployer.account.address, KNINE, feeTok.abi, "mint", [EXPLOITER, AMOUNT]);
    await callAs(EXPLOITER, KNINE, feeTok.abi, "approve", [bounty.address, AMOUNT]);
    await assert.rejects(bounty.write.recoverKnine(), /wtf/);

    // False-return scenario
    await network.provider.request({ method: "hardhat_reset", params: [] });
    await deployAndInstallToken("FalseReturnERC20");
    const frTok = await viem.getContractAt("FalseReturnERC20", KNINE);
    const bounty2 = await viem.deployContract("KnineRecoveryBountyDecayAccept", [initial, decay, termsHash], { value: parseEther("1") });
    await callAs(deployer.account.address, KNINE, frTok.abi, "mint", [EXPLOITER, AMOUNT]);
    await callAs(EXPLOITER, KNINE, frTok.abi, "approve", [bounty2.address, AMOUNT]);
    await assert.rejects(bounty2.write.recoverKnine(), /wtf/);
  });

  it("finalization: cannot accept or recover twice", async () => {
    const { viem } = await network.connect();
    const [deployer] = await viem.getWalletClients();

    await deployAndInstallToken("MockERC20");
    const mock = await viem.getContractAt("MockERC20", KNINE);
    const bounty = await viem.deployContract("KnineRecoveryBountyDecayAccept", [initial, decay, termsHash], { value: parseEther("1") });

    await callAs(deployer.account.address, KNINE, mock.abi, "mint", [EXPLOITER, AMOUNT]);
    await callAs(EXPLOITER, KNINE, mock.abi, "approve", [bounty.address, AMOUNT]);
    await bounty.write.recoverKnine();

    await assert.rejects(bounty.write.recoverKnine(), /FINALIZED/);
    await assert.rejects(bounty.write.accept({ account: EXPLOITER }), /FINALIZED/);
  });

  it("withdraw: sends remaining ETH to TREASURY after expiry when not locked by acceptance", async () => {
    const { viem } = await network.connect();
    const publicClient = await viem.getPublicClient();
    const [deployer] = await viem.getWalletClients();

    await deployAndInstallToken("MockERC20");
    const bounty = await viem.deployContract("KnineRecoveryBountyDecayAccept", [initial, decay, termsHash], { value: parseEther("3") });

    // Early withdraw blocked
    await assert.rejects(bounty.write.withdrawToTreasury(), /EARLY/);

    await increaseTime(initial + decay + 1n);
    const before = await publicClient.getBalance({ address: TREASURY });
    await bounty.write.withdrawToTreasury();
    const after = await publicClient.getBalance({ address: TREASURY });
    assert.equal(after - before, parseEther("3"));
  });
});
