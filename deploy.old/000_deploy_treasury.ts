import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { constants } from "../constants"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy } = deployments

  const { deployer } = await getNamedAccounts()

  await deploy("CoreDAOTreasury", {
    from: deployer,
    args: [],
    log: true,
    deterministicDeployment: false,
    proxy: {
      owner: constants.PROXY_ADMIN,
      proxyContract: "TransparentUpgradeableProxy",
    },
  })
}

export default func
func.tags = ["CoreDAOTreasury"]
func.dependencies = []
