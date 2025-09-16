import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  WalletConnectBackend,
  resetQrGenerator,
  resetWalletConnectProviderLoader,
  setQrGenerator,
  setWalletConnectProviderLoader,
} from "../../scripts/lib/provider-backend/walletconnect";
import type { WalletConnectBackendConfig } from "../../scripts/lib/provider-backend/types";

const TEST_SESSION_PATH = "tmp/test-walletconnect-session.json";

interface RequestLog {
  method: string;
  params?: unknown;
}

class FakeEthereumProvider extends EventEmitter {
  static lastInitOptions: any;
  static nextAccounts: string[] = [];
  static initialChainId = 1;
  static switchShouldFail = false;
  static addChainCalls: any[] = [];
  static sendCalls: any[] = [];
  static requests: RequestLog[] = [];
  static enableCalls = 0;
  static disconnectCalls = 0;

  static reset(): void {
    FakeEthereumProvider.lastInitOptions = undefined;
    FakeEthereumProvider.nextAccounts = [];
    FakeEthereumProvider.initialChainId = 1;
    FakeEthereumProvider.switchShouldFail = false;
    FakeEthereumProvider.addChainCalls = [];
    FakeEthereumProvider.sendCalls = [];
    FakeEthereumProvider.requests = [];
    FakeEthereumProvider.enableCalls = 0;
    FakeEthereumProvider.disconnectCalls = 0;
  }

  static async init(opts: any): Promise<FakeEthereumProvider> {
    FakeEthereumProvider.lastInitOptions = opts;
    const instance = new FakeEthereumProvider();
    if (FakeEthereumProvider.nextAccounts.length > 0) {
      instance.accounts = [...FakeEthereumProvider.nextAccounts];
      instance.session = {};
    }
    return instance;
  }

  accounts: string[] = [];
  session: Record<string, unknown> | null = null;
  private chainId: number;

  constructor() {
    super();
    this.chainId = FakeEthereumProvider.initialChainId;
  }

  async enable(): Promise<string[]> {
    FakeEthereumProvider.enableCalls += 1;
    if (this.accounts.length === 0) {
      this.accounts = [...FakeEthereumProvider.nextAccounts];
    }
    this.emit("display_uri", "wc://stub");
    return this.accounts;
  }

  async request({ method, params }: { method: string; params?: any }): Promise<unknown> {
    FakeEthereumProvider.requests.push({ method, params });
    switch (method) {
      case "eth_chainId":
        return `0x${this.chainId.toString(16)}`;
      case "wallet_switchEthereumChain": {
        if (FakeEthereumProvider.switchShouldFail) {
          FakeEthereumProvider.switchShouldFail = false;
          const error = new Error("Unrecognized chain");
          (error as any).code = 4902;
          throw error;
        }
        this.chainId = parseInt(params[0].chainId, 16);
        return null;
      }
      case "wallet_addEthereumChain": {
        FakeEthereumProvider.addChainCalls.push(params[0]);
        this.chainId = parseInt(params[0].chainId, 16);
        return null;
      }
      case "eth_sendTransaction": {
        FakeEthereumProvider.sendCalls.push(params[0]);
        return "0xhash";
      }
      case "eth_requestAccounts": {
        if (this.accounts.length === 0) {
          this.accounts = [...FakeEthereumProvider.nextAccounts];
        }
        return this.accounts;
      }
      default:
        throw new Error(`Unhandled JSON-RPC method: ${method}`);
    }
  }

  async disconnect(): Promise<void> {
    FakeEthereumProvider.disconnectCalls += 1;
  }
}

describe("WalletConnectBackend", () => {
  let qrUris: string[];

  beforeEach(() => {
    FakeEthereumProvider.reset();
    qrUris = [];
    setWalletConnectProviderLoader(async () =>
      FakeEthereumProvider as unknown as typeof import("@walletconnect/ethereum-provider").EthereumProvider,
    );
    setQrGenerator(async (uri) => {
      qrUris.push(uri);
    });
  });

  afterEach(() => {
    resetWalletConnectProviderLoader();
    resetQrGenerator();
  });

  function buildConfig(): WalletConnectBackendConfig {
    return {
      type: "walletconnect",
      rpcUrl: "https://example",
      chainId: 11155111,
      confirmations: 2,
      projectId: "project",
      metadata: {
        name: "Test",
        description: "Testing",
        url: "https://example",
        icons: ["https://example/icon.png"],
      },
      sessionPath: TEST_SESSION_PATH,
      feeOverrides: { maxFeePerGas: 42n },
      chainName: "Sepolia",
      nativeCurrency: { name: "Sepolia", symbol: "SEP", decimals: 18 },
      blockExplorerUrls: ["https://sepolia.etherscan.io"],
      disableQRCode: false,
    };
  }

  it("connects using WalletConnect and sends transactions with overrides", async () => {
    FakeEthereumProvider.nextAccounts = ["0x1234567890abcdef1234567890abcdef12345678"];
    FakeEthereumProvider.initialChainId = 1;

    const backend = new WalletConnectBackend(buildConfig());
    await backend.connect();

    assert.equal(qrUris.length, 1);
    assert.equal(qrUris[0], "wc://stub");
    assert.equal(FakeEthereumProvider.enableCalls, 1);

    const address = await backend.getAddress();
    assert.equal(address, "0x1234567890ABCDEF1234567890ABCDEF12345678");

    // ensure wallet_switchEthereumChain was requested during connect
    const switchCall = FakeEthereumProvider.requests.find((entry) => entry.method === "wallet_switchEthereumChain");
    assert(switchCall, "wallet_switchEthereumChain should be called");
    assert.equal((switchCall!.params as any)[0].chainId, "0xAA36A7");

    const txHash = await backend.sendTransaction({
      chainId: 11155111,
      from: address,
      data: "0xdeadbeef",
    });

    assert.equal(txHash, "0xhash");
    assert.equal(FakeEthereumProvider.sendCalls.length, 1);
    const sentTx = FakeEthereumProvider.sendCalls[0];
    assert.equal(sentTx.chainId, "0xAA36A7");
    assert.equal(sentTx.data, "0xdeadbeef");
    assert.equal(sentTx.from, address);
    assert.equal(sentTx.maxFeePerGas, "0x2766017f");
  });

  it("adds the chain when wallet reports it as unrecognized", async () => {
    FakeEthereumProvider.nextAccounts = ["0x1234567890abcdef1234567890abcdef12345678"];
    FakeEthereumProvider.initialChainId = 1;
    FakeEthereumProvider.switchShouldFail = true;

    const backend = new WalletConnectBackend(buildConfig());
    await backend.connect();

    assert.equal(FakeEthereumProvider.addChainCalls.length, 1);
    const added = FakeEthereumProvider.addChainCalls[0];
    assert.equal(added.chainId, "0xAA36A7");
    assert.deepEqual(added.rpcUrls, ["https://example"]);
    assert.equal(added.chainName, "Sepolia");
    assert.deepEqual(added.blockExplorerUrls, ["https://sepolia.etherscan.io"]);
    assert.deepEqual(added.nativeCurrency, {
      name: "Sepolia",
      symbol: "SEP",
      decimals: 18,
    });
  });
});
