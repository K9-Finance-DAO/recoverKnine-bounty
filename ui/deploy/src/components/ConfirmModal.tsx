type Props = {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  predictedAddress?: string
  args: {
    initialPeriod: number
    decayPeriod: number
    termsHash: string
  }
}

export function ConfirmModal({ open, onClose, onConfirm, predictedAddress, args }: Props) {
  if (!open) return null
  const startTs = Math.floor(Date.now() / 1000)
  const endTs = startTs + Number(args.initialPeriod || 0) + Number(args.decayPeriod || 0)
  const endDate = new Date(endTs * 1000).toUTCString()
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Confirm Deployment</h3>
        <div className="grid">
          <div>
            <div className="muted">Predicted Address</div>
            <div className="mono">{predictedAddress ?? '—'}</div>
          </div>
          <div>
            <div className="muted">Constructor Args</div>
            <div className="mono">initialPeriod: {args.initialPeriod} sec</div>
            <div className="mono">decayPeriod: {args.decayPeriod} sec</div>
            <div className="mono">termsHash: {args.termsHash}</div>
          </div>
          <div>
            <div className="muted">Bounty End (timestamp)</div>
            <div className="mono">{endTs}</div>
          </div>
          <div>
            <div className="muted">Bounty End (UTC)</div>
            <div className="mono">{endDate}</div>
          </div>
        </div>
        <div className="spacer" />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button onClick={onConfirm}>Deploy</button>
        </div>
        <div className="hint">START approximated as now; on-chain START is the block timestamp of deployment.</div>
      </div>
    </div>
  )
}

