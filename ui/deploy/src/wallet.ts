import { http } from 'wagmi'
import { mainnet, sepolia, hardhat as wagmiHardhat } from 'wagmi/chains'
import { getDefaultConfig } from '@rainbow-me/rainbowkit'

const enableDevChain = import.meta.env.VITE_ENABLE_DEV_CHAIN === 'true'
const hardhatRpc = import.meta.env.VITE_HARDHAT_RPC_URL ?? 'http://127.0.0.1:8545'
const sepoliaRpc = import.meta.env.VITE_SEPOLIA_RPC_URL ?? 'https://rpc.sepolia.org'
const mainnetRpc = import.meta.env.VITE_MAINNET_RPC_URL ?? 'https://cloudflare-eth.com'

// Optional: expose a second Hardhat chain with a different RPC (e.g., via Cloudflare Tunnel)
const enableHardhatTunnel = import.meta.env.VITE_ENABLE_HARDHAT_TUNNEL === 'true'
const hardhatTunnelRpc = import.meta.env.VITE_HARDHAT_TUNNEL_RPC_URL ?? 'https://hardhat.claude.do'
const hardhatTunnelName = import.meta.env.VITE_HARDHAT_TUNNEL_NAME ?? 'Hardhat (Tunnel)'

const hardhatTunnel = {
  ...wagmiHardhat,
  name: hardhatTunnelName,
  rpcUrls: {
    default: { http: [hardhatTunnelRpc] },
    public: { http: [hardhatTunnelRpc] },
  },
} as typeof wagmiHardhat

const chains = enableDevChain
  ? [
      // Keep default Hardhat first so programmatic switches target local by default
      wagmiHardhat,
      ...(enableHardhatTunnel ? [hardhatTunnel] : []),
      mainnet,
      sepolia,
    ]
  : [mainnet, sepolia]

export const config = getDefaultConfig({
  appName: 'K9 Recovery Bounty',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? 'SET_PROJECT_ID',
  chains,
  transports: {
    [mainnet.id]: http(mainnetRpc),
    [sepolia.id]: http(sepoliaRpc),
    ...(enableDevChain ? { [wagmiHardhat.id]: http(hardhatRpc) } : {}),
    ...(enableDevChain && enableHardhatTunnel ? { [hardhatTunnel.id]: http(hardhatTunnelRpc) } : {}),
  } as any,
  ssr: false,
})
