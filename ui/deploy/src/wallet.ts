import { createConfig, http } from 'wagmi'
import { mainnet, sepolia } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'
import { walletConnect } from 'wagmi/connectors'

export const config = createConfig({
  chains: [mainnet, sepolia],
  connectors: [
    injected({ shimDisconnect: true }),
    walletConnect({ projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? 'SET_PROJECT_ID', showQrModal: true })
  ],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http()
  }
})
