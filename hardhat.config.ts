import "dotenv-defaults/config"
import "@nomiclabs/hardhat-etherscan"
import "@nomiclabs/hardhat-solhint"
import "@nomiclabs/hardhat-ethers"
import "@nomiclabs/hardhat-waffle"
import "@typechain/hardhat"
import "hardhat-abi-exporter"
import "hardhat-gas-reporter"
import "hardhat-spdx-license-identifier"
import "hardhat-storage-layout"
import "hardhat-watcher"
import "solidity-coverage"
import "hardhat-deploy"
import "hardhat-dependency-compiler"
import "./tasks"
import "@nomiclabs/hardhat-truffle5"

import { HardhatNetworkHDAccountsUserConfig, HardhatUserConfig } from "hardhat/types"

const accounts: HardhatNetworkHDAccountsUserConfig = {
  mnemonic: process.env.MNEMONIC || "test test test test test test test test test test test junk",
}

const config: HardhatUserConfig = {
  abiExporter: {
    path: "./abi",
    clear: false,
    flat: true,
  },
  paths: {
    artifacts: "artifacts",
    cache: "cache",
    deploy: "deploy",
    deployments: "deployments",
    imports: "imports",
    sources: "contracts",
    tests: "test",
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  namedAccounts: {
    deployer: 0,
  },
  defaultNetwork: "hardhat",
  gasReporter: {
    currency: "USD",
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    enabled: process.env.REPORT_GAS === "true",
    excludeContracts: ["contracts/mocks/", "contracts/interfaces/", "contracts/libraries/", "contracts/types/"],
  },
  mocha: {
    timeout: 200000,
    bail: true,
  },
  networks: {
    mainnet: {
      url: process.env.NODE_RPC,
      accounts,
      gasPrice: 120 * 1000000000,
      saveDeployments: true,
      chainId: 1,
    },
    hardhat: {
      chainId: 1,
      accounts,
      mining: {
        auto: !process.env.SLOW_MINING,
        interval: (!process.env.SLOW_MINING && undefined) || [10000, 20000],
      },
      forking: {
        enabled: process.env.FORKING === "true",
        url: (process.env.FORKING === "true" && process.env.NODE_RPC) || "",
        blockNumber: (process.env.FORKING === "true" && parseInt(process.env.FORKING_BLOCK!, 10)) || undefined,
      },
      live: !!process.env.HARDHAT_NETWORK_LIVE,
      gasPrice: 0,
      initialBaseFeePerGas: 0,
      saveDeployments: true,
      tags: ["test", "local"],
    },
    goerli: {
      saveDeployments: true,
      url: "https://goerli.infura.io/v3/" + process.env.INFURA_API_KEY,
      accounts,
    },
  },
  solidity: {
    compilers: [
      {
        version: "0.8.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          outputSelection: {
            "*": {
              "*": ["storageLayout"],
            },
          },
        },
      },
    ],
  },
  spdxLicenseIdentifier: {
    overwrite: false,
    runOnCompile: true,
  },
  typechain: {
    outDir: "types",
    target: "ethers-v5",
  },
  watcher: {
    compilation: {
      tasks: ["compile"],
      files: ["contracts"],
      verbose: true,
    },
  },
  dependencyCompiler: {
    paths: ["@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol"],
  },
}

export default config
