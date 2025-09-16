import { parseGwei } from "viem";

import type {
  BackendConfig,
  BaseBackendConfig,
  GasOverrides,
  LedgerBackendConfig,
  LocalBackendConfig,
  SignerBackendType,
  TrezorBackendConfig,
  WalletConnectBackendConfig,
} from "./types";

interface ConfigDefaults {
  type?: SignerBackendType;
  rpcUrl?: string;
  chainId?: number;
  confirmations?: number;
  chainName?: string;
  nativeCurrency?: {
    name?: string;
    symbol?: string;
    decimals?: number;
  };
  blockExplorerUrls?: string[];
}

interface ParseContext {
  env: NodeJS.ProcessEnv;
  defaults: ConfigDefaults;
}

function requireValue(name: string, value: string | undefined): string {
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment value '${name}'.`);
  }
  return value;
}

function parseInteger(name: string, value: string | undefined, fallback?: number): number {
  if (value === undefined || value === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required integer value for '${name}'.`);
  }
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    throw new Error(`Environment value '${name}' must be an integer (received '${value}').`);
  }
  return num;
}

function parsePositiveInteger(name: string, value: string | undefined, fallback: number): number {
  const parsed = parseInteger(name, value, fallback);
  if (parsed <= 0) {
    throw new Error(`Environment value '${name}' must be greater than zero (received '${parsed}').`);
  }
  return parsed;
}

function parseOptionalBigInt(value: string | undefined): bigint | undefined {
  if (!value) return undefined;
  try {
    return BigInt(value);
  } catch (error) {
    throw new Error(`Unable to parse bigint from '${value}': ${error}`);
  }
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Unable to parse number from '${value}'.`);
  }
  return parsed;
}

function parseOptionalGwei(value: string | undefined): bigint | undefined {
  if (!value) return undefined;
  return parseGwei(value as `${number}`);
}

function parseGasOverrides(env: NodeJS.ProcessEnv): GasOverrides | undefined {
  const gas = parseOptionalBigInt(env.BACKEND_GAS ?? env.DEPLOY_GAS);
  const gasPrice = parseOptionalGwei(env.BACKEND_GAS_PRICE_GWEI ?? env.DEPLOY_GAS_PRICE_GWEI);
  const maxFeePerGas = parseOptionalGwei(env.BACKEND_MAX_FEE_GWEI ?? env.DEPLOY_MAX_FEE_GWEI);
  const maxPriorityFeePerGas = parseOptionalGwei(env.BACKEND_MAX_PRIORITY_FEE_GWEI ?? env.DEPLOY_MAX_PRIORITY_FEE_GWEI);
  const nonce = parseOptionalBigInt(env.BACKEND_NONCE ?? env.DEPLOY_NONCE);

  if (
    gas === undefined &&
    gasPrice === undefined &&
    maxFeePerGas === undefined &&
    maxPriorityFeePerGas === undefined &&
    nonce === undefined
  ) {
    return undefined;
  }

  return { gas, gasPrice, maxFeePerGas, maxPriorityFeePerGas, nonce };
}

function resolveBaseConfig(ctx: ParseContext): BaseBackendConfig {
  const { env, defaults } = ctx;
  const type = (env.SIGNER_BACKEND ?? defaults.type ?? "walletconnect").toLowerCase() as SignerBackendType;
  const rpcUrl = env.BACKEND_RPC_URL ?? env.PROVIDER_RPC_URL ?? env.RPC_URL ?? defaults.rpcUrl;
  const chainId = env.BACKEND_CHAIN_ID ?? env.PROVIDER_CHAIN_ID ?? env.CHAIN_ID ?? defaults.chainId;
  const confirmationsValue = env.BACKEND_CONFIRMATIONS ?? env.DEPLOY_CONFIRMATIONS;
  const chainName = env.BACKEND_CHAIN_NAME ?? env.CHAIN_NAME ?? defaults.chainName;

  const nativeCurrencyCandidate = {
    name: env.BACKEND_NATIVE_CURRENCY_NAME ?? env.NATIVE_CURRENCY_NAME ?? defaults.nativeCurrency?.name,
    symbol: env.BACKEND_NATIVE_CURRENCY_SYMBOL ?? env.NATIVE_CURRENCY_SYMBOL ?? defaults.nativeCurrency?.symbol,
    decimals:
      parseOptionalNumber(env.BACKEND_NATIVE_CURRENCY_DECIMALS ?? env.NATIVE_CURRENCY_DECIMALS) ??
      defaults.nativeCurrency?.decimals,
  };
  const nativeCurrency =
    nativeCurrencyCandidate.name === undefined &&
    nativeCurrencyCandidate.symbol === undefined &&
    nativeCurrencyCandidate.decimals === undefined
      ? undefined
      : nativeCurrencyCandidate;
  const blockExplorerSource =
    env.BACKEND_BLOCK_EXPLORERS ??
    env.CHAIN_BLOCK_EXPLORERS ??
    (defaults.blockExplorerUrls ? defaults.blockExplorerUrls.join(",") : undefined);

  if (rpcUrl === undefined) {
    throw new Error(
      "RPC URL not provided. Set BACKEND_RPC_URL (or PROVIDER_RPC_URL / RPC_URL) or pass a default when resolving the backend config.",
    );
  }

  const chainIdNumber = parseInteger("CHAIN_ID", chainId?.toString(), defaults.chainId);
  const confirmations = parsePositiveInteger(
    "CONFIRMATIONS",
    confirmationsValue,
    defaults.confirmations ?? 1,
  );

  return {
    type,
    rpcUrl,
    chainId: chainIdNumber,
    confirmations,
    feeOverrides: parseGasOverrides(env),
    chainName,
    nativeCurrency,
    blockExplorerUrls: blockExplorerSource
      ? blockExplorerSource
          .split(",")
          .map((url) => url.trim())
          .filter((url) => url.length > 0)
      : defaults.blockExplorerUrls,
  };
}

function buildLocalConfig(base: BaseBackendConfig, env: NodeJS.ProcessEnv): LocalBackendConfig {
  return {
    ...base,
    type: "local",
    privateKey: env.SIGNER_PRIVATE_KEY ?? env.PRIVATE_KEY,
    mnemonic: env.SIGNER_MNEMONIC ?? env.MNEMONIC,
    accountIndex: env.SIGNER_ACCOUNT_INDEX ? parseInteger("SIGNER_ACCOUNT_INDEX", env.SIGNER_ACCOUNT_INDEX) : undefined,
  };
}

function parseIcons(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function buildWalletConnectConfig(base: BaseBackendConfig, env: NodeJS.ProcessEnv): WalletConnectBackendConfig {
  const projectId = requireValue("WC_PROJECT_ID", env.WC_PROJECT_ID);
  const sessionPath = requireValue("WC_SESSION_PATH", env.WC_SESSION_PATH ?? ".walletconnect-session.json");

  const metadata = {
    name: env.WC_APP_NAME ?? "Hardhat WalletConnect",
    description: env.WC_APP_DESCRIPTION ?? "WalletConnect deployment backend",
    url: env.WC_APP_URL ?? "https://walletconnect.com",
    icons: parseIcons(env.WC_APP_ICON ?? env.WC_APP_ICONS) ?? [],
  };

  if (metadata.icons.length === 0) {
    metadata.icons = ["https://avatars.githubusercontent.com/u/37784886?s=200&v=4"];
  }

  const disableQRCode = Boolean(env.WC_DISABLE_QR && env.WC_DISABLE_QR !== "0");

  return {
    ...base,
    type: "walletconnect",
    projectId,
    sessionPath,
    relayUrl: env.WC_RELAY_URL,
    metadata,
    disableQRCode,
  };
}

function buildLedgerConfig(base: BaseBackendConfig, env: NodeJS.ProcessEnv): LedgerBackendConfig {
  return {
    ...base,
    type: "ledger",
    derivationPath: env.LEDGER_DERIVATION_PATH,
    accountIndex: env.LEDGER_ACCOUNT_INDEX ? parseInteger("LEDGER_ACCOUNT_INDEX", env.LEDGER_ACCOUNT_INDEX) : undefined,
  };
}

function buildTrezorConfig(base: BaseBackendConfig, env: NodeJS.ProcessEnv): TrezorBackendConfig {
  const manifestEmail = env.TREZOR_MANIFEST_EMAIL;
  const manifestAppUrl = env.TREZOR_MANIFEST_APP_URL;
  return {
    ...base,
    type: "trezor",
    derivationPath: env.TREZOR_DERIVATION_PATH,
    accountIndex: env.TREZOR_ACCOUNT_INDEX ? parseInteger("TREZOR_ACCOUNT_INDEX", env.TREZOR_ACCOUNT_INDEX) : undefined,
    manifest:
      manifestEmail && manifestAppUrl
        ? {
            email: manifestEmail,
            appUrl: manifestAppUrl,
          }
        : undefined,
  };
}

export function loadBackendConfig(
  env: NodeJS.ProcessEnv,
  defaults: ConfigDefaults = {},
): BackendConfig {
  const base = resolveBaseConfig({ env, defaults });

  switch (base.type) {
    case "local":
      return buildLocalConfig(base, env);
    case "walletconnect":
      return buildWalletConnectConfig(base, env);
    case "ledger":
      return buildLedgerConfig(base, env);
    case "trezor":
      return buildTrezorConfig(base, env);
    default:
      throw new Error(`Unsupported backend type '${(base as BackendConfig).type}'.`);
  }
}
