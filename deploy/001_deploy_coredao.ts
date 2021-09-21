import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { ethers } from "hardhat"
import { CoreDAO, CoreDAOTreasury } from "../types"

const startingCOREDAOAmount = 30000000

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy } = deployments

  const { deployer } = await getNamedAccounts()
  const Treasury = await ethers.getContract<CoreDAOTreasury>("CoreDAOTreasury")

  await deploy("CoreDAO", {
    from: deployer,
    log: true,
    args: [startingCOREDAOAmount, Treasury.address],
    deterministicDeployment: false,
  })
  const CoreDAO = await ethers.getContract<CoreDAO>("CoreDAO")
  await Treasury.initialize(CoreDAO.address)
}

export default func
func.tags = ["CoreDAO"]
func.dependencies = ["CoreDAOTreasury"]
