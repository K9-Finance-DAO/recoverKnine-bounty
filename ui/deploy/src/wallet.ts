import { createConfig, http } from 'wagmi'
import { mainnet, sepolia, hardhat as wagmiHardhat } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'
import { walletConnect } from 'wagmi/connectors'

const enableDevChain = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEV_CHAIN === 'true'
const hardhatRpc = import.meta.env.VITE_HARDHAT_RPC_URL ?? 'http://127.0.0.1:8545'

const chains = enableDevChain ? [wagmiHardhat, mainnet, sepolia] : [mainnet, sepolia]

export const config = createConfig({
  chains,
  connectors: [
    injected({ shimDisconnect: true }),
    walletConnect({ projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? 'SET_PROJECT_ID', showQrModal: true })
  ],
  transports: Object.fromEntries([
    [mainnet.id, http()],
    [sepolia.id, http()],
    ...(enableDevChain ? [[wagmiHardhat.id, http(hardhatRpc)]] : [])
  ]) as any,
})
