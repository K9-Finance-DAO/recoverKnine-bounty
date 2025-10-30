import type { HardhatUserConfig } from "hardhat/config";

import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable } from "hardhat/config";

import hardhatTypechain from "@nomicfoundation/hardhat-typechain";

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxViemPlugin, hardhatTypechain],
  typechain: {
    outDir: "ui/deploy/src/typechain",
  },
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
    },
  },
  networks: {
    hardhat: {
      // Default network for unit tests - clean, fast, no forking
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatMainnet: {
      // Forked network for integration tests with real contracts
      type: "edr-simulated",
      chainType: "l1",
      forking: {
        url: "https://eth-mainnet.g.alchemy.com/v2/Inz_9P6EyMb-QUak42Q6dPZw_GoTWDBR",
      },
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    localhost: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545",
    },
    mainnet: {
      type: "http",
      chainType: "l1",
      url: configVariable("MAINNET_RPC_URL"),
      accounts: [configVariable("MAINNET_PRIVATE_KEY")],
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
  },
  verify: {
    etherscan: {
      apiKey: configVariable("ETHERSCAN_API_KEY"),
    },
  },
};

export default config;
