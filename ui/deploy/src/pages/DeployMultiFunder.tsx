import { useState } from 'react'
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi'
import { isAddress } from 'viem'
import { normalizeHardhatArtifact, type HardhatArtifact } from '../lib/artifacts'
import mfArtifactJson from '../../../../artifacts/contracts/KnineRecoveryBountyDecayAcceptMultiFunder.sol/KnineRecoveryBountyDecayAcceptMultiFunder.json'

const MF_ARTIFACT: HardhatArtifact | null = normalizeHardhatArtifact(mfArtifactJson)

export default function DeployMultiFunder() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const [initial, setInitial] = useState<string>('1900800')
  const [decay, setDecay] = useState<string>('604800')
  const [termsHash, setTermsHash] = useState<string>('0xdc41ed1a9106d5b1a5325e996240b1d76ee437ead8b8471e627f9b53ad2d3d1f')
  const [deployedAddr, setDeployedAddr] = useState<`0x${string}` | undefined>()
  const [fundAddr, setFundAddr] = useState<string>('')
  const [fundWei, setFundWei] = useState<string>('0')

  const [busy, setBusy] = useState<'deploy' | 'fund' | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()

  const explorerBase = chainId === 1
    ? 'https://etherscan.io/tx/'
    : chainId === 11155111
      ? 'https://sepolia.etherscan.io/tx/'
      : undefined

  async function handleDeploy() {
    try {
      if (!MF_ARTIFACT || !walletClient || !publicClient || !address) return
      if (!termsHash || termsHash.length !== 66) return
      const init = BigInt(initial || '0')
      const dec = BigInt(decay || '0')
      setBusy('deploy'); setError(undefined)
      const hash = await walletClient.deployContract({
        abi: MF_ARTIFACT.abi as any,
        bytecode: MF_ARTIFACT.bytecode,
        account: address,
        args: [init, dec, termsHash as `0x${string}`],
      })
      setTxHash(hash)
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      const created = receipt.contractAddress as `0x${string}` | null
      if (created) {
        setDeployedAddr(created)
        setFundAddr(created)
      }
    } catch (e: any) {
      console.error(e); setError(e?.shortMessage || e?.message || 'Deploy MultiFunder failed')
    } finally { setBusy(undefined) }
  }

  async function handleFund() {
    try {
      if (!walletClient || !publicClient || !address || !isAddress(fundAddr)) return
      const value = BigInt(fundWei || '0')
      if (value === 0n) return
      setBusy('fund'); setError(undefined)
      const hash = await walletClient.sendTransaction({
        to: fundAddr as `0x${string}`,
        account: address,
        value,
        chain: publicClient.chain,
      })
      setTxHash(hash)
      await publicClient.waitForTransactionReceipt({ hash })
    } catch (e: any) {
      console.error(e); setError(e?.shortMessage || e?.message || 'Funding transaction failed')
    } finally { setBusy(undefined) }
  }

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="muted">Deploy and fund the Multi‑Funder bounty contract.</div>

      {error && <div className="error">{error}</div>}
      {txHash && (
        <div className="muted">
          Last Tx:{' '}
          {explorerBase ? (
            <a href={`${explorerBase}${txHash}`} target="_blank" rel="noopener noreferrer" className="mono">
              {txHash}
            </a>
          ) : (
            <span className="mono">{txHash}</span>
          )}
        </div>
      )}

      <div className="card">
        <strong>KnineRecoveryBountyDecayAcceptMultiFunder</strong>
        <div className="spacer" />
        <div className="col" style={{ gap: 12 }}>
          <div className="grid">
            <div>
              <label>initialPeriod (seconds)</label>
              <input type="number" min={0} value={initial} onChange={(e) => setInitial(e.target.value.trim())} />
            </div>
            <div>
              <label>decayPeriod (seconds)</label>
              <input type="number" min={1} value={decay} onChange={(e) => setDecay(e.target.value.trim())} />
            </div>
          </div>
          <label>termsHash (bytes32)</label>
          <input type="text" value={termsHash} onChange={(e) => setTermsHash(e.target.value.trim())} />
          <button
            onClick={handleDeploy}
            disabled={!isConnected || !MF_ARTIFACT || busy !== undefined || termsHash.length !== 66}
          >
            {busy === 'deploy' ? 'Deploying…' : 'Deploy Multi‑Funder'}
          </button>
          {!MF_ARTIFACT && (
            <div className="hint">Artifact missing. Rebuild contracts to refresh <code>artifacts/contracts/KnineRecoveryBountyDecayAcceptMultiFunder.sol/KnineRecoveryBountyDecayAcceptMultiFunder.json</code>.</div>
          )}
          {deployedAddr && (
            <div className="muted">Deployed contract: <span className="mono">{deployedAddr}</span></div>
          )}
        </div>
      </div>

      <div className="card">
        <strong>Fund Contract</strong>
        <div className="spacer" />
        <div className="col" style={{ gap: 12 }}>
          <label>Contract Address</label>
          <input type="text" placeholder="0x…" value={fundAddr} onChange={(e) => setFundAddr(e.target.value.trim())} />
          <label>ETH to Send (wei)</label>
          <input type="text" placeholder="0" value={fundWei} onChange={(e) => setFundWei(e.target.value.trim())} />
          <button
            className="secondary"
            onClick={handleFund}
            disabled={!isConnected || !isAddress(fundAddr) || busy !== undefined || !fundWei || BigInt(fundWei || '0') === 0n}
          >
            {busy === 'fund' ? 'Sending…' : 'Send ETH to contract'}
          </button>
          <div className="hint">Minimum per funding transaction: 0.01 ETH. Contract rejects smaller amounts.</div>
        </div>
      </div>

    </div>
  )
}

