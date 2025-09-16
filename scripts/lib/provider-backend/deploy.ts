import type {
  Address,
  Chain,
  DeployContractParameters,
  EstimateGasParameters,
  Hash,
  PublicClient,
  WaitForTransactionReceiptReturnType,
} from "viem";

import {
  loadDeploymentData,
  type DeploymentData,
} from "./artifacts";
import {
  isAccountModeBackend,
  type GasOverrides,
  type PreparedTransactionRequest,
  type SignerBackend,
} from "./types";

export interface DeploymentTarget {
  /** Fully qualified Hardhat artifact identifier. */
  identifier: string;
  /** Constructor arguments for the deployment. */
  constructorArgs?: unknown[];
  /** Optional ETH value to send alongside the deployment. */
  value?: bigint;
  /** Overrides applied only for this deployment. */
  overrides?: GasOverrides;
}

export interface DeployContractWithBackendOptions {
  backend: SignerBackend;
  publicClient: PublicClient;
  chainId: number;
  target: DeploymentTarget;
  confirmations?: number;
  /** Default overrides from backend config (e.g., env). */
  feeOverrides?: GasOverrides;
  /** Optional logger invoked for high-level steps. */
  logger?: (message: string) => void;
  /** Custom loader (useful for tests). Defaults to Hardhat artifacts loader. */
  loadDeploymentDataFn?: typeof loadDeploymentData;
}

export interface DeployContractResult<
  chain extends Chain | undefined = Chain | undefined,
> {
  contractAddress: Address;
  transactionHash: Hash;
  receipt: WaitForTransactionReceiptReturnType<chain>;
  deployer: Address;
}

function mergeGasOverrides(
  base?: GasOverrides,
  overrides?: GasOverrides,
): GasOverrides | undefined {
  if (!base && !overrides) return undefined;
  return {
    gas: overrides?.gas ?? base?.gas,
    gasPrice: overrides?.gasPrice ?? base?.gasPrice,
    maxFeePerGas: overrides?.maxFeePerGas ?? base?.maxFeePerGas,
    maxPriorityFeePerGas:
      overrides?.maxPriorityFeePerGas ?? base?.maxPriorityFeePerGas,
    nonce: overrides?.nonce ?? base?.nonce,
  };
}

function applyGasOverrides(
  request: PreparedTransactionRequest,
  overrides?: GasOverrides,
): void {
  if (!overrides) return;
  if (overrides.gas !== undefined) request.gas = overrides.gas;
  if (overrides.gasPrice !== undefined) request.gasPrice = overrides.gasPrice;
  if (overrides.maxFeePerGas !== undefined)
    request.maxFeePerGas = overrides.maxFeePerGas;
  if (overrides.maxPriorityFeePerGas !== undefined)
    request.maxPriorityFeePerGas = overrides.maxPriorityFeePerGas;
  if (overrides.nonce !== undefined) request.nonce = overrides.nonce;
}

async function ensureGasOverride(
  publicClient: PublicClient,
  from: Address,
  data: DeploymentData["data"],
  value: bigint | undefined,
  overrides?: GasOverrides,
): Promise<GasOverrides> {
  let effective: GasOverrides = overrides ? { ...overrides } : {};

  if (effective.gas === undefined) {
    const estimateArgs: EstimateGasParameters = {
      account: from,
      data,
    };

    if (value !== undefined) {
      estimateArgs.value = value;
    }
    if (effective.nonce !== undefined) {
      estimateArgs.nonce = effective.nonce;
    }

    effective = {
      ...effective,
      gas: await publicClient.estimateGas(estimateArgs),
    };
  }

  return effective;
}

async function assertClientChainId(
  publicClient: PublicClient,
  expected: number,
): Promise<void> {
  const actual = await publicClient.getChainId();
  if (actual !== expected) {
    throw new Error(
      `Public client chain ID ${actual} does not match expected chain ID ${expected}.`,
    );
  }
}

function buildAccountDeployParameters(
  deployment: DeploymentData,
  target: DeploymentTarget,
  overrides: GasOverrides,
): DeployContractParameters {
  const constructorArgs = (target.constructorArgs ?? []) as readonly unknown[];
  const params: DeployContractParameters = {
    abi: deployment.abi,
    bytecode: deployment.bytecode,
    args: constructorArgs,
  };

  if (target.value !== undefined) params.value = target.value;
  if (overrides.gas !== undefined) params.gas = overrides.gas;
  if (overrides.gasPrice !== undefined) params.gasPrice = overrides.gasPrice;
  if (overrides.maxFeePerGas !== undefined)
    params.maxFeePerGas = overrides.maxFeePerGas;
  if (overrides.maxPriorityFeePerGas !== undefined)
    params.maxPriorityFeePerGas = overrides.maxPriorityFeePerGas;
  if (overrides.nonce !== undefined) params.nonce = overrides.nonce;

  return params;
}

function assertContractAddress(
  receipt: WaitForTransactionReceiptReturnType<Chain | undefined>,
): Address {
  if (!receipt.contractAddress) {
    throw new Error(
      "Transaction receipt did not include a contract address. The deployment may have failed.",
    );
  }
  return receipt.contractAddress;
}

export async function deployContractWithBackend(
  options: DeployContractWithBackendOptions,
): Promise<DeployContractResult> {
  const {
    backend,
    publicClient,
    chainId,
    target,
    confirmations = 1,
    feeOverrides,
    logger,
    loadDeploymentDataFn = loadDeploymentData,
  } = options;

  const log = logger ?? (() => {});
  const constructorArgs = target.constructorArgs ?? [];

  await backend.connect();
  await backend.ensureChain(chainId);
  await assertClientChainId(publicClient, chainId);
  const deployer = await backend.getAddress();

  log(
    `Preparing deployment of ${target.identifier} from ${deployer} on chain ${chainId}.`,
  );

  const deployment = await loadDeploymentDataFn(target.identifier, constructorArgs);
  const mergedOverrides = mergeGasOverrides(feeOverrides, target.overrides);
  const overridesWithGas = await ensureGasOverride(
    publicClient,
    deployer,
    deployment.data,
    target.value,
    mergedOverrides,
  );

  if (isAccountModeBackend(backend)) {
    const walletClient = await backend.getWalletClient(publicClient);
    const params = buildAccountDeployParameters(
      deployment,
      target,
      overridesWithGas,
    );

    log("Sending deployment transaction via account-mode backend.");
    const hash = await walletClient.deployContract(params);

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      confirmations,
    });

    const contractAddress = assertContractAddress(receipt);
    log(
      `Deployment transaction ${hash} confirmed. Contract at ${contractAddress}.`,
    );

    return {
      contractAddress,
      transactionHash: hash,
      receipt,
      deployer,
    };
  }

  const request: PreparedTransactionRequest = {
    chainId,
    from: deployer,
    data: deployment.data,
  };

  if (target.value !== undefined) {
    request.value = target.value;
  }

  applyGasOverrides(request, overridesWithGas);

  log("Sending deployment transaction via remote-mode backend.");
  const hash = await backend.sendTransaction(request);

  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations,
  });

  const contractAddress = assertContractAddress(receipt);
  log(`Deployment transaction ${hash} confirmed. Contract at ${contractAddress}.`);

  return {
    contractAddress,
    transactionHash: hash,
    receipt,
    deployer,
  };
}
