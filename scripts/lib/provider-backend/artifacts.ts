import { artifacts } from "hardhat";
import type { Artifact } from "hardhat/types";
import { encodeDeployData, type Abi, type Hex } from "viem";

export interface DeploymentArtifact {
  abi: Abi;
  bytecode: Hex;
  contractName: string;
  sourceName: string;
}

export interface DeploymentData {
  abi: Abi;
  bytecode: Hex;
  data: Hex;
}

export async function readDeploymentArtifact(identifier: string): Promise<DeploymentArtifact> {
  const artifact: Artifact = await artifacts.readArtifact(identifier);
  if (!artifact.bytecode || artifact.bytecode === "0x") {
    throw new Error(`Artifact '${identifier}' does not contain bytecode. Did you compile the contract?`);
  }

  return {
    abi: artifact.abi as Abi,
    bytecode: artifact.bytecode as Hex,
    contractName: artifact.contractName,
    sourceName: artifact.sourceName,
  };
}

export async function loadDeploymentData(
  identifier: string,
  constructorArgs: unknown[] = [],
): Promise<DeploymentData> {
  const artifact = await readDeploymentArtifact(identifier);
  const data = encodeDeployData({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: constructorArgs,
  });

  return {
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    data,
  };
}
