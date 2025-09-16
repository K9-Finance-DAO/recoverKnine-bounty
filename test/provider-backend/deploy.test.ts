import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  AccountModeBackend,
  PreparedTransactionRequest,
  RemoteModeBackend,
} from "../../scripts/lib/provider-backend/types";
import {
  deployContractWithBackend,
  type DeploymentTarget,
} from "../../scripts/lib/provider-backend/deploy";
import type {
  Address,
  DeployContractParameters,
  EstimateGasParameters,
  Hash,
  Hex,
  PublicClient,
  WaitForTransactionReceiptReturnType,
} from "viem";
import type { DeploymentData } from "../../scripts/lib/provider-backend/artifacts";

const TEST_DEPLOYMENT: DeploymentData = {
  abi: [] as unknown as DeploymentData["abi"],
  bytecode: "0x6000600055" as Hex,
  data: "0x6000600055" as Hex,
};

class FakeRemoteBackend implements RemoteModeBackend {
  readonly type = "walletconnect" as const;
  readonly mode = "remote" as const;
  readonly address: Address;
  connectCalls = 0;
  ensureChains: number[] = [];
  requests: PreparedTransactionRequest[] = [];

  constructor(address: Address) {
    this.address = address;
  }

  async connect(): Promise<void> {
    this.connectCalls += 1;
  }

  async getAddress(): Promise<Address> {
    return this.address;
  }

  async ensureChain(chainId: number): Promise<void> {
    this.ensureChains.push(chainId);
  }

  async sendTransaction(request: PreparedTransactionRequest): Promise<Hash> {
    this.requests.push(request);
    return "0xremotehash" as Hash;
  }

  async disconnect(): Promise<void> {
    // no-op
  }
}

class FakeWalletClient {
  calls: DeployContractParameters[] = [];

  async deployContract(params: DeployContractParameters): Promise<Hash> {
    this.calls.push(params);
    return "0xaccounthash" as Hash;
  }
}

class FakeAccountBackend implements AccountModeBackend {
  readonly type = "local" as const;
  readonly mode = "account" as const;
  readonly address: Address;
  connectCalls = 0;
  ensureChains: number[] = [];
  lastWalletClientRequest: PublicClient | null = null;
  readonly walletClient: FakeWalletClient;

  constructor(address: Address, walletClient: FakeWalletClient) {
    this.address = address;
    this.walletClient = walletClient;
  }

  async connect(): Promise<void> {
    this.connectCalls += 1;
  }

  async getAddress(): Promise<Address> {
    return this.address;
  }

  async ensureChain(chainId: number): Promise<void> {
    this.ensureChains.push(chainId);
  }

  async getWalletClient(publicClient: PublicClient): Promise<any> {
    this.lastWalletClientRequest = publicClient;
    return this.walletClient as any;
  }

  async disconnect(): Promise<void> {
    // no-op
  }
}

class FakePublicClient {
  readonly chainId: number;
  readonly gasEstimate: bigint;
  readonly receiptAddress: Address;
  estimateCalls: EstimateGasParameters[] = [];
  waitCalls: { hash: Hash; confirmations?: number }[] = [];

  constructor(chainId: number, gasEstimate: bigint, receiptAddress: Address) {
    this.chainId = chainId;
    this.gasEstimate = gasEstimate;
    this.receiptAddress = receiptAddress;
  }

  async getChainId(): Promise<number> {
    return this.chainId;
  }

  async estimateGas(args: EstimateGasParameters): Promise<bigint> {
    this.estimateCalls.push(args);
    return this.gasEstimate;
  }

  async waitForTransactionReceipt({
    hash,
    confirmations,
  }: {
    hash: Hash;
    confirmations?: number;
  }): Promise<WaitForTransactionReceiptReturnType<undefined>> {
    this.waitCalls.push({ hash, confirmations });
    return { contractAddress: this.receiptAddress } as WaitForTransactionReceiptReturnType<undefined>;
  }
}

describe("deployContractWithBackend", () => {
  it("deploys via remote backend with merged overrides and gas estimation", async () => {
    const backend = new FakeRemoteBackend(
      "0x1234567890abcdef1234567890abcdef12345678" as Address,
    );
    const publicClient = new FakePublicClient(
      11155111,
      220000n,
      "0x9999999999999999999999999999999999999999" as Address,
    );

    const target: DeploymentTarget = {
      identifier: "TestContract",
      value: 1n,
    };

    const result = await deployContractWithBackend({
      backend,
      publicClient: publicClient as unknown as PublicClient,
      chainId: 11155111,
      confirmations: 2,
      target,
      feeOverrides: { maxFeePerGas: 42n },
      loadDeploymentDataFn: async () => TEST_DEPLOYMENT,
    });

    assert.equal(result.contractAddress, publicClient.receiptAddress);
    assert.equal(result.transactionHash, "0xremotehash");
    assert.equal(result.deployer, backend.address);

    assert.equal(backend.connectCalls, 1);
    assert.deepEqual(backend.ensureChains, [11155111]);
    assert.equal(backend.requests.length, 1);
    const request = backend.requests[0];
    assert.equal(request.chainId, 11155111);
    assert.equal(request.from, backend.address);
    assert.equal(request.value, 1n);
    assert.equal(request.gas, 220000n);
    assert.equal(request.maxFeePerGas, 42n);

    assert.equal(publicClient.estimateCalls.length, 1);
    assert.equal(publicClient.estimateCalls[0].account, backend.address);
    assert.equal(publicClient.waitCalls.length, 1);
    assert.deepEqual(publicClient.waitCalls[0], {
      hash: "0xremotehash",
      confirmations: 2,
    });
  });

  it("deploys via account backend honoring overrides and estimation", async () => {
    const walletClient = new FakeWalletClient();
    const backend = new FakeAccountBackend(
      "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address,
      walletClient,
    );
    const publicClient = new FakePublicClient(
      10,
      310000n,
      "0x7777777777777777777777777777777777777777" as Address,
    );

    const target: DeploymentTarget = {
      identifier: "TestContract",
      constructorArgs: ["hello", 123],
      value: 5n,
      overrides: { gasPrice: 99n },
    };

    const result = await deployContractWithBackend({
      backend,
      publicClient: publicClient as unknown as PublicClient,
      chainId: 10,
      confirmations: 1,
      target,
      feeOverrides: { maxPriorityFeePerGas: 3n, nonce: 12n },
      loadDeploymentDataFn: async () => TEST_DEPLOYMENT,
    });

    assert.equal(result.contractAddress, publicClient.receiptAddress);
    assert.equal(result.transactionHash, "0xaccounthash");
    assert.equal(result.deployer, backend.address);

    assert.equal(backend.connectCalls, 1);
    assert.deepEqual(backend.ensureChains, [10]);
    assert.equal(publicClient.estimateCalls.length, 1);
    const estimateArgs = publicClient.estimateCalls[0];
    assert.equal(estimateArgs.account, backend.address);
    assert.equal(estimateArgs.nonce, 12n);

    assert.equal(walletClient.calls.length, 1);
    const params = walletClient.calls[0];
    assert.equal(params.gas, 310000n);
    assert.equal(params.gasPrice, 99n);
    assert.equal(params.maxPriorityFeePerGas, 3n);
    assert.equal(params.nonce, 12n);
    assert.equal(params.value, 5n);
    assert.deepEqual(params.args, ["hello", 123]);
  });
});
