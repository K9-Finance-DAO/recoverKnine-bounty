import type {
  Hex,
  Address,
  Hash,
  PublicClient,
  PublicClientConfig,
  WalletClient,
  WalletClientConfig,
  TypedDataDefinition,
} from "viem";

export type SignerBackendType = "local" | "walletconnect" | "ledger" | "trezor";

export interface GasOverrides {
  gas?: bigint;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  nonce?: bigint;
}

export interface PreparedTransactionRequest extends GasOverrides {
  to?: Address;
  value?: bigint;
  data?: Hex;
  chainId: number;
  from: Address;
}

export interface SignableMessage {
  raw: Hex | string;
}

export interface SignerBackendBase {
  readonly type: SignerBackendType;
  readonly mode: "account" | "remote";
  connect(): Promise<void>;
  getAddress(): Promise<Address>;
  ensureChain(chainId: number): Promise<void>;
  disconnect(): Promise<void>;
}

export interface AccountModeBackend extends SignerBackendBase {
  readonly mode: "account";
  getWalletClient(
    publicClient: PublicClient,
    config?: Partial<WalletClientConfig>,
  ): Promise<WalletClient>;
  signMessage?(message: SignableMessage): Promise<Hex>;
  signTypedData?(typedData: TypedDataDefinition): Promise<Hex>;
}

export interface RemoteModeBackend extends SignerBackendBase {
  readonly mode: "remote";
  sendTransaction(
    tx: PreparedTransactionRequest,
  ): Promise<Hash>;
  signMessage?(message: SignableMessage): Promise<Hex>;
  signTypedData?(typedData: TypedDataDefinition): Promise<Hex>;
}

export type SignerBackend = AccountModeBackend | RemoteModeBackend;

export function isAccountModeBackend(
  backend: SignerBackend,
): backend is AccountModeBackend {
  return backend.mode === "account";
}

export function isRemoteModeBackend(
  backend: SignerBackend,
): backend is RemoteModeBackend {
  return backend.mode === "remote";
}

export interface BaseBackendConfig {
  type: SignerBackendType;
  rpcUrl: string;
  chainId: number;
  confirmations: number;
  feeOverrides?: GasOverrides;
  chainName?: string;
  nativeCurrency?: {
    name?: string;
    symbol?: string;
    decimals?: number;
  };
  blockExplorerUrls?: string[];
}

export interface LocalBackendConfig extends BaseBackendConfig {
  type: "local";
  privateKey?: string;
  mnemonic?: string;
  accountIndex?: number;
}

export interface WalletConnectMetadata {
  name: string;
  description: string;
  url: string;
  icons: string[];
}

export interface WalletConnectBackendConfig extends BaseBackendConfig {
  type: "walletconnect";
  projectId: string;
  metadata: WalletConnectMetadata;
  relayUrl?: string;
  sessionPath: string;
  disableQRCode?: boolean;
}

export interface LedgerBackendConfig extends BaseBackendConfig {
  type: "ledger";
  derivationPath?: string;
  accountIndex?: number;
}

export interface TrezorBackendConfig extends BaseBackendConfig {
  type: "trezor";
  derivationPath?: string;
  accountIndex?: number;
  manifest?: {
    email: string;
    appUrl: string;
  };
}

export type BackendConfig =
  | LocalBackendConfig
  | WalletConnectBackendConfig
  | LedgerBackendConfig
  | TrezorBackendConfig;

export interface BackendFactoryContext {
  config: BackendConfig;
  makePublicClient(
    overrides?: Partial<PublicClientConfig>,
  ): PublicClient;
}
