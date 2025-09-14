export type HardhatArtifact = {
  abi: any[]
  bytecode: `0x${string}`
  contractName?: string
}

export async function loadArtifact(): Promise<HardhatArtifact | null> {
  // Expects file at: /artifacts/KnineRecoveryBountyDecayAccept.json (served from public/)
  try {
    const res = await fetch('/artifacts/KnineRecoveryBountyDecayAccept.json', { cache: 'no-store' })
    if (!res.ok) return null
    const json = await res.json()
    // Support both Hardhat full artifacts and minimal exported JSON
    if (json?.abi && json?.bytecode) return { abi: json.abi, bytecode: json.bytecode, contractName: json.contractName }
    if (json?.abi && json?.evm?.bytecode?.object) return { abi: json.abi, bytecode: `0x${json.evm.bytecode.object}`, contractName: json.contractName }
    return null
  } catch {
    return null
  }
}

