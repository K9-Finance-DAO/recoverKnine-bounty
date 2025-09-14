import { useAccount, useConnect, useDisconnect } from 'wagmi'

export function Connect() {
  const { address, chain } = useAccount()
  const { connectors, connect, status: connectStatus, error } = useConnect()
  const { disconnect } = useDisconnect()

  if (address)
    return (
      <div className="row">
        <span className="pill mono" title={address}>{short(address)}</span>
        <span className="pill muted">{chain?.name ?? 'Unknown'}</span>
        <button className="secondary" onClick={() => disconnect()}>Disconnect</button>
      </div>
    )

  return (
    <div className="row">
      {connectors.map((c) => (
        <button key={c.id} onClick={() => connect({ connector: c })} disabled={!c.ready || connectStatus === 'pending'}>
          {label(c.name)}
        </button>
      ))}
      {error && <span className="pill" style={{ borderColor: '#d55' }} title={error.message}>Error</span>}
    </div>
  )
}

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function label(name: string) {
  if (name.toLowerCase().includes('injected')) return 'Rabby / MetaMask'
  return name
}

