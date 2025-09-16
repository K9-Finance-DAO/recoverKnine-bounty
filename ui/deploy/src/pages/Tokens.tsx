import { useState } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { isAddress } from 'viem'
import { normalizeHardhatArtifact, type HardhatArtifact } from '../lib/artifacts'
import erc20ArtifactJson from '../../../../artifacts/contracts/5_ETH_Bounty_for_Knine_Return_ERC20.sol/ReturnKnineFor5ETHBountyERC20.json'
import erc721ArtifactJson from '../../../../artifacts/contracts/5_ETH_Bounty_for_Knine_Return_NFT.sol/ReturnKnineFor5ETHBountyNFT.json'

type BusyKey = 'deploy20' | 'deploy721' | 'erc20Five' | 'erc20Knine' | 'erc721Five' | 'erc721Knine'

const ERC20_ARTIFACT: HardhatArtifact | null = normalizeHardhatArtifact(erc20ArtifactJson)
const ERC721_ARTIFACT: HardhatArtifact | null = normalizeHardhatArtifact(erc721ArtifactJson)

export default function Tokens() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  // Track addresses of freshly deployed contracts
  const [deployedErc20, setDeployedErc20] = useState<`0x${string}` | undefined>()
  const [deployedErc721, setDeployedErc721] = useState<`0x${string}` | undefined>()
  const [erc20Addr, setErc20Addr] = useState<string>('')
  const [erc721Addr, setErc721Addr] = useState<string>('')

  // Busy + notifications
  const [busy, setBusy] = useState<BusyKey | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()

  async function handleDeploy20() {
    try {
      if (!ERC20_ARTIFACT || !walletClient || !publicClient || !address) return
      setBusy('deploy20'); setError(undefined)
      const hash = await walletClient.deployContract({
        abi: ERC20_ARTIFACT.abi as any,
        bytecode: ERC20_ARTIFACT.bytecode,
        account: address,
      })
      setTxHash(hash)
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      const created = receipt.contractAddress as `0x${string}` | null
      if (created) {
        setDeployedErc20(created)
        setErc20Addr(created)
      }
    } catch (e: any) {
      console.error(e); setError(e?.shortMessage || e?.message || 'Deploy ERC20 failed')
    } finally { setBusy(undefined) }
  }

  async function handleDeploy721() {
    try {
      if (!ERC721_ARTIFACT || !walletClient || !publicClient || !address) return
      setBusy('deploy721'); setError(undefined)
      const hash = await walletClient.deployContract({
        abi: ERC721_ARTIFACT.abi as any,
        bytecode: ERC721_ARTIFACT.bytecode,
        account: address,
      })
      setTxHash(hash)
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      const created = receipt.contractAddress as `0x${string}` | null
      if (created) {
        setDeployedErc721(created)
        setErc721Addr(created)
      }
    } catch (e: any) {
      console.error(e); setError(e?.shortMessage || e?.message || 'Deploy NFT failed')
    } finally { setBusy(undefined) }
  }

  async function callErc20(method: 'FiveETHBounty' | 'KNINE_Bounty', busyKey: BusyKey) {
    try {
      if (!ERC20_ARTIFACT || !walletClient || !publicClient || !address || !isAddress(erc20Addr)) return
      setBusy(busyKey); setError(undefined)
      const hash = await walletClient.writeContract({
        address: erc20Addr as `0x${string}`,
        abi: ERC20_ARTIFACT.abi as any,
        functionName: method,
        account: address,
      })
      setTxHash(hash)
      await publicClient.waitForTransactionReceipt({ hash })
    } catch (e: any) {
      console.error(e); setError(e?.shortMessage || e?.message || `Call ${method} failed`)
    } finally { setBusy(undefined) }
  }

  async function callErc721(method: 'FiveETHBounty' | 'KNINE_Bounty', busyKey: BusyKey) {
    try {
      if (!ERC721_ARTIFACT || !walletClient || !publicClient || !address || !isAddress(erc721Addr)) return
      setBusy(busyKey); setError(undefined)
      const hash = await walletClient.writeContract({
        address: erc721Addr as `0x${string}`,
        abi: ERC721_ARTIFACT.abi as any,
        functionName: method,
        account: address,
      })
      setTxHash(hash)
      await publicClient.waitForTransactionReceipt({ hash })
    } catch (e: any) {
      console.error(e); setError(e?.shortMessage || e?.message || `Call ${method} failed`)
    } finally { setBusy(undefined) }
  }

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="muted">Deploy the fresh bounty ERC20 or NFT contract to your connected wallet.</div>

      {error && <div className="error">{error}</div>}
      {txHash && (
        <div className="muted">Last Tx: <span className="mono">{txHash}</span></div>
      )}

      <div className="grid">
        <div>
          <strong>ERC20</strong>
          <div className="spacer" />
          <div className="col">
            <button onClick={handleDeploy20} disabled={!isConnected || !ERC20_ARTIFACT || busy !== undefined}>
              {busy === 'deploy20' ? 'Deploying…' : 'Deploy ERC20'}
            </button>
            {!ERC20_ARTIFACT && (
              <div className="hint">Artifact missing. Rebuild contracts to refresh <code>artifacts/contracts/5_ETH_Bounty_for_Knine_Return_ERC20.sol/ReturnKnineFor5ETHBountyERC20.json</code>.</div>
            )}
            {deployedErc20 && (
              <div className="muted">Deployed contract: <span className="mono">{deployedErc20}</span></div>
            )}
            <div className="spacer" />
            <label>ERC20 Contract Address</label>
            <input type="text" placeholder="0x…" value={erc20Addr} onChange={(e) => setErc20Addr(e.target.value.trim())} />
            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <button
                onClick={() => callErc20('FiveETHBounty', 'erc20Five')}
                disabled={!isConnected || !ERC20_ARTIFACT || !isAddress(erc20Addr) || busy !== undefined}
              >
                {busy === 'erc20Five' ? 'Calling…' : 'Call FiveETHBounty()'}
              </button>
              <button
                onClick={() => callErc20('KNINE_Bounty', 'erc20Knine')}
                disabled={!isConnected || !ERC20_ARTIFACT || !isAddress(erc20Addr) || busy !== undefined}
              >
                {busy === 'erc20Knine' ? 'Calling…' : 'Call KNINE_Bounty()'}
              </button>
            </div>
          </div>
        </div>

        <div>
          <strong>NFT (ERC721)</strong>
          <div className="spacer" />
          <div className="col">
            <button onClick={handleDeploy721} disabled={!isConnected || !ERC721_ARTIFACT || busy !== undefined}>
              {busy === 'deploy721' ? 'Deploying…' : 'Deploy NFT'}
            </button>
            {!ERC721_ARTIFACT && (
              <div className="hint">Artifact missing. Rebuild contracts to refresh <code>artifacts/contracts/5_ETH_Bounty_for_Knine_Return_NFT.sol/ReturnKnineFor5ETHBountyNFT.json</code>.</div>
            )}
            {deployedErc721 && (
              <div className="muted">Deployed contract: <span className="mono">{deployedErc721}</span></div>
            )}
            <div className="spacer" />
            <label>NFT Contract Address</label>
            <input type="text" placeholder="0x…" value={erc721Addr} onChange={(e) => setErc721Addr(e.target.value.trim())} />
            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <button
                onClick={() => callErc721('FiveETHBounty', 'erc721Five')}
                disabled={!isConnected || !ERC721_ARTIFACT || !isAddress(erc721Addr) || busy !== undefined}
              >
                {busy === 'erc721Five' ? 'Calling…' : 'Call FiveETHBounty()'}
              </button>
              <button
                onClick={() => callErc721('KNINE_Bounty', 'erc721Knine')}
                disabled={!isConnected || !ERC721_ARTIFACT || !isAddress(erc721Addr) || busy !== undefined}
              >
                {busy === 'erc721Knine' ? 'Calling…' : 'Call KNINE_Bounty()'}
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
