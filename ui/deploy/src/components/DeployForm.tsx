import { useEffect, useMemo, useState } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { getContractAddress, isHex } from 'viem'
import { loadArtifact } from '../lib/artifacts'
import { ConfirmModal } from './ConfirmModal'

type Artifact = Awaited<ReturnType<typeof loadArtifact>>

export function DeployForm() {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const [artifact, setArtifact] = useState<Artifact>(null)
  const [loadingArtifact, setLoadingArtifact] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [initialPeriod, setInitialPeriod] = useState<number>(691200)
  const [decayPeriod, setDecayPeriod] = useState<number>(1814400)
  const [termsHash, setTermsHash] = useState<string>(
    '0xce05e792f591bc617f475e9be1d00df89446c592738f73ff72b23c84107e645e'
  )

  const [predictedAddress, setPredictedAddress] = useState<string | undefined>()
  const [open, setOpen] = useState(false)
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const [deployedAddress, setDeployedAddress] = useState<string | undefined>()
  const [isDeploying, setIsDeploying] = useState(false)

  useEffect(() => {
    setLoadingArtifact(true)
    loadArtifact().then((a) => {
      setArtifact(a)
      setLoadingArtifact(false)
    })
  }, [])

  const initialDays = useMemo(() => secondsToDays(initialPeriod), [initialPeriod])
  const decayDays = useMemo(() => secondsToDays(decayPeriod), [decayPeriod])

  async function refreshPredictedAddress() {
    try {
      if (!address || !publicClient) return
      const nonce = await publicClient.getTransactionCount({ address })
      const predicted = getContractAddress({ from: address, nonce })
      setPredictedAddress(predicted)
    } catch (e) {
      console.error(e)
      setPredictedAddress(undefined)
    }
  }

  useEffect(() => { refreshPredictedAddress() }, [address, publicClient])

  function validate(): string | null {
    if (!address) return 'Connect a wallet first.'
    if (!artifact) return 'Artifact not found. Build and export it.'
    if (!Number.isFinite(initialPeriod) || initialPeriod < 0) return 'Initial period must be >= 0 seconds.'
    if (!Number.isFinite(decayPeriod) || decayPeriod <= 0) return 'Decay period must be > 0 seconds.'
    if (!isHex(termsHash) || (termsHash as string).length !== 66) return 'termsHash must be a 32-byte 0x-hex string.'
    return null
  }

  async function handleConfirm() {
    try {
      if (!artifact || !walletClient || !publicClient || !address) return
      setIsDeploying(true)
      setError(null)

      // If you want to send ETH on deploy, set value below. Default 0n.
      const hash = await walletClient.deployContract({
        abi: artifact.abi as any,
        bytecode: artifact.bytecode,
        args: [BigInt(initialPeriod), BigInt(decayPeriod), termsHash as `0x${string}`],
        account: address
      })
      setTxHash(hash)
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      const created = receipt.contractAddress ?? undefined
      setDeployedAddress(created)
      setOpen(false)
    } catch (e: any) {
      console.error(e)
      setError(e?.shortMessage || e?.message || 'Deployment failed')
    } finally {
      setIsDeploying(false)
      refreshPredictedAddress()
    }
  }

  const err = validate()

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="muted">
        Use an injected wallet (Rabby / MetaMask) or WalletConnect to deploy the contract. Ensure your wallet is on the intended network.
      </div>

      <div className="grid">
        <div>
          <label htmlFor="initial">initialPeriod (seconds)</label>
          <div className="row">
            <input id="initial" type="number" min={0} placeholder="0" value={initialPeriod}
              onChange={(e) => setInitialPeriod(Number(e.target.value))} />
            <span className="pill">{initialDays} days</span>
          </div>
        </div>
        <div>
          <label htmlFor="decay">decayPeriod (seconds)</label>
          <div className="row">
            <input id="decay" type="number" min={1} placeholder="0" value={decayPeriod}
              onChange={(e) => setDecayPeriod(Number(e.target.value))} />
            <span className="pill">{decayDays} days</span>
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="terms">termsHash (bytes32, 0x…)</label>
        <input id="terms" type="text" value={termsHash}
          onChange={(e) => setTermsHash(e.target.value.trim())} />
        <div className="hint">Use scripts/compute-terms-hash.mjs to compute the keccak256 of your terms .md</div>
      </div>

      <div className="row">
        <div>
          <div className="muted">Predicted Address</div>
          <div className="mono">{predictedAddress ?? '—'}</div>
        </div>
        <div className="space" />
        <button onClick={() => setOpen(true)} disabled={Boolean(err) || loadingArtifact || isDeploying}>
          Review & Deploy
        </button>
      </div>

      {error && <div style={{ color: '#f77' }}>{error}</div>}
      {!artifact && (
        <div className="hint">Artifact not found. After compiling, copy the contract artifact JSON to <code>ui/deploy/public/artifacts/KnineRecoveryBountyDecayAccept.json</code>.</div>
      )}
      {txHash && (
        <div className="muted">Tx Hash: <span className="mono">{txHash}</span></div>
      )}
      {deployedAddress && (
        <div className="muted">Deployed at: <span className="mono">{deployedAddress}</span></div>
      )}

      <ConfirmModal
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={handleConfirm}
        predictedAddress={predictedAddress}
        args={{ initialPeriod, decayPeriod, termsHash }}
      />
    </div>
  )
}

function secondsToDays(s: number) {
  if (!Number.isFinite(s)) return '—'
  const days = s / 86400
  // show up to 3 decimals when not whole
  return Math.abs(days - Math.round(days)) < 1e-9 ? String(Math.round(days)) : days.toFixed(3)
}
