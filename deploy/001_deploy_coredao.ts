import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { ethers, network } from "hardhat"
import { CoreDAO, CoreDAOTreasury } from "../types"
import { impersonate } from "../test/utilities"

const DEPLOYER = "0x5A16552f59ea34E44ec81E58b3817833E9fD5436"
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

  if (!network.live) {
    await impersonate(DEPLOYER)
    const deployerSigner = await ethers.getSigner(DEPLOYER)
    await Treasury.connect(deployerSigner).initialize(CoreDAO.address)
  } else {
    await Treasury.initialize(CoreDAO.address)
  }
}

export default func
func.tags = ["CoreDAO"]
func.dependencies = ["CoreDAOTreasury"]
