import { ConnectButton } from '@rainbow-me/rainbowkit'

export function Connect() {
  return <ConnectButton chainStatus="icon" showBalance={false} />
}
