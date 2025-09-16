export type HardhatArtifact = {
  abi: any[]
  bytecode: `0x${string}`
  contractName?: string
}

export function normalizeHardhatArtifact(input: any): HardhatArtifact | null {
  if (!input) return null
  if (input.abi && input.bytecode) {
    return { abi: input.abi, bytecode: input.bytecode as `0x${string}`, contractName: input.contractName }
  }
  if (input.abi && input.evm?.bytecode?.object) {
    return {
      abi: input.abi,
      bytecode: `0x${input.evm.bytecode.object}`,
      contractName: input.contractName,
    }
  }
  return null
}

export async function loadArtifact(): Promise<HardhatArtifact | null> {
  // Expects file at: /artifacts/KnineRecoveryBountyDecayAccept.json (served from public/)
  try {
    const res = await fetch('/artifacts/KnineRecoveryBountyDecayAccept.json', { cache: 'no-store' })
    if (!res.ok) return null
    const json = await res.json()
    return normalizeHardhatArtifact(json)
  } catch {
    return null
  }
}

/** Load an artifact served from the Vite public folder.
 *  Example path: `/artifacts/ReturnKnineFor5ETHBountyERC20.json`.
 */
export async function loadArtifactAt(path: string): Promise<HardhatArtifact | null> {
  try {
    const res = await fetch(path, { cache: 'no-store' })
    if (!res.ok) return null
    const json = await res.json()
    return normalizeHardhatArtifact(json)
  } catch {
    return null
  }
}
