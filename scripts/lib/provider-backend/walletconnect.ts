import type { EthereumProvider } from "@walletconnect/ethereum-provider";
import { getAddress, toHex, type Hash } from "viem";

import { JsonFileKeyValueStorage } from "./storage";
import type {
  GasOverrides,
  PreparedTransactionRequest,
  RemoteModeBackend,
  WalletConnectBackendConfig,
} from "./types";

function hexChainId(id: number): `0x${string}` {
  return `0x${id.toString(16)}` as const;
}

function applyOverrides(
  tx: PreparedTransactionRequest,
  overrides?: GasOverrides,
): PreparedTransactionRequest {
  if (!overrides) return tx;
  return {
    ...tx,
    gas: tx.gas ?? overrides.gas,
    gasPrice: tx.gasPrice ?? overrides.gasPrice,
    maxFeePerGas: tx.maxFeePerGas ?? overrides.maxFeePerGas,
    maxPriorityFeePerGas:
      tx.maxPriorityFeePerGas ?? overrides.maxPriorityFeePerGas,
    nonce: tx.nonce ?? overrides.nonce,
  };
}

function isUnrecognizedChainError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: number; message?: string };
  if (maybeError.code === 4902) return true;
  if (typeof maybeError.message === "string") {
    return maybeError.message.toLowerCase().includes("unrecognized chain");
  }
  return false;
}

let providerLoader: (() => Promise<typeof EthereumProvider>) | null = null;

export function setWalletConnectProviderLoader(
  loader: () => Promise<typeof EthereumProvider>,
): void {
  providerLoader = loader;
}

export function resetWalletConnectProviderLoader(): void {
  providerLoader = null;
}

async function importProvider(): Promise<typeof EthereumProvider> {
  if (providerLoader) return providerLoader();
  const mod = await import("@walletconnect/ethereum-provider");
  return mod.EthereumProvider;
}

let qrGenerator: ((uri: string) => Promise<void>) | null = null;

export function setQrGenerator(generator: (uri: string) => Promise<void>): void {
  qrGenerator = generator;
}

export function resetQrGenerator(): void {
  qrGenerator = null;
}

async function generateQr(uri: string): Promise<void> {
  if (qrGenerator) {
    await qrGenerator(uri);
    return;
  }
  try {
    const mod = await import("qrcode-terminal");
    mod.default.generate(uri, { small: true });
  } catch (error) {
    console.warn("⚠️  Failed to render QR code in terminal:", error);
    console.log("WalletConnect URI:", uri);
  }
}

export class WalletConnectBackend implements RemoteModeBackend {
  readonly type = "walletconnect" as const;
  readonly mode = "remote" as const;

  private provider: EthereumProvider | null = null;
  private cachedAddress: string | null = null;

  constructor(private readonly config: WalletConnectBackendConfig) {}

  private ensureProvider(): EthereumProvider {
    if (!this.provider) {
      throw new Error("WalletConnect provider is not initialized. Call connect() first.");
    }
    return this.provider;
  }

  async connect(): Promise<void> {
    if (this.provider) return;

    const providerClass = await importProvider();
    const storage = new JsonFileKeyValueStorage(this.config.sessionPath);

    const provider = await providerClass.init({
      projectId: this.config.projectId,
      optionalChains: [this.config.chainId],
      rpcMap: { [this.config.chainId]: this.config.rpcUrl },
      metadata: this.config.metadata,
      showQrModal: false,
      relayUrl: this.config.relayUrl,
      storage,
    });

    provider.on("display_uri", async (uri: string) => {
      console.log("WalletConnect URI available. Scan with your mobile wallet.");
      if (this.config.disableQRCode) {
        console.log(uri);
        return;
      }
      await generateQr(uri);
    });

    provider.on("accountsChanged", (accounts: string[]) => {
      if (accounts && accounts.length > 0) {
        this.cachedAddress = getAddress(accounts[0]);
      }
    });

    provider.on("disconnect", () => {
      this.cachedAddress = null;
    });

    this.provider = provider;

    if (provider.session && provider.accounts.length > 0) {
      this.cachedAddress = getAddress(provider.accounts[0]);
    } else {
      const accounts = (await provider.enable()) as string[];
      if (!accounts || accounts.length === 0) {
        throw new Error("WalletConnect did not return any accounts.");
      }
      this.cachedAddress = getAddress(accounts[0]);
    }

    await this.ensureChain(this.config.chainId);
  }

  async getAddress(): Promise<string> {
    if (!this.cachedAddress) {
      await this.connect();
    }
    const address = this.cachedAddress;
    if (!address) {
      throw new Error("Unable to determine WalletConnect account address.");
    }
    return address;
  }

  async ensureChain(chainId: number): Promise<void> {
    const provider = this.ensureProvider();
    const currentHex = (await provider.request({ method: "eth_chainId" })) as string;
    const currentId = Number(BigInt(currentHex));
    if (currentId === chainId) return;

    const hexId = hexChainId(chainId);
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexId }],
      });
      return;
    } catch (error) {
      if (!isUnrecognizedChainError(error)) {
        throw error;
      }
    }

    const chainName = this.config.chainName ?? `Chain ${chainId}`;
    const nativeCurrency = {
      name: this.config.nativeCurrency?.name ?? "Ether",
      symbol: this.config.nativeCurrency?.symbol ?? "ETH",
      decimals: this.config.nativeCurrency?.decimals ?? 18,
    };

    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hexId,
          chainName,
          rpcUrls: [this.config.rpcUrl],
          nativeCurrency,
          blockExplorerUrls: this.config.blockExplorerUrls,
        },
      ],
    });
  }

  private buildTransactionRequest(
    tx: PreparedTransactionRequest,
  ): Record<string, string> {
    const request: Record<string, string> = {
      from: tx.from,
      chainId: hexChainId(tx.chainId),
    };

    if (tx.to) request.to = tx.to;
    if (tx.data) request.data = tx.data;
    if (tx.value !== undefined) request.value = toHex(tx.value);
    if (tx.gas !== undefined) request.gas = toHex(tx.gas);
    if (tx.gasPrice !== undefined) request.gasPrice = toHex(tx.gasPrice);
    if (tx.maxFeePerGas !== undefined) request.maxFeePerGas = toHex(tx.maxFeePerGas);
    if (tx.maxPriorityFeePerGas !== undefined)
      request.maxPriorityFeePerGas = toHex(tx.maxPriorityFeePerGas);
    if (tx.nonce !== undefined) request.nonce = toHex(tx.nonce);

    return request;
  }

  async sendTransaction(
    tx: PreparedTransactionRequest,
  ): Promise<Hash> {
    await this.connect();
    await this.ensureChain(tx.chainId);

    if (tx.from.toLowerCase() !== (await this.getAddress()).toLowerCase()) {
      throw new Error(`Transaction sender ${tx.from} does not match connected WalletConnect account.`);
    }

    const provider = this.ensureProvider();
    const merged = applyOverrides(tx, this.config.feeOverrides);
    const request = this.buildTransactionRequest(merged);
    const hash = await provider.request({
      method: "eth_sendTransaction",
      params: [request],
    });

    return hash as Hash;
  }

  async disconnect(): Promise<void> {
    if (!this.provider) return;
    try {
      await this.provider.disconnect();
    } catch (error) {
      console.warn("⚠️  WalletConnect disconnect error:", error);
    }
    this.provider = null;
    this.cachedAddress = null;
  }
}
