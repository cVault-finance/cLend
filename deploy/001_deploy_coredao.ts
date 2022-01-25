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
  const Treasury = await ethers.getContractAt<CoreDAOTreasury>("CoreDAOTreasury", "0xe508a37101FCe81AB412626eE5F1A648244380de")

  await deployments.save("CoreDAOTreasury", {
    abi: require("../abi/CoreDAOTreasury.json"),
    address: Treasury.address,
  })

  const CoreDAO = await ethers.getContractAt<CoreDAO>("CoreDAO", "0xf66Cd2f8755a21d3c8683a10269F795c0532Dd58")

  await deployments.save("CoreDAO", {
    abi: require("../abi/CoreDAO.json"),
    address: CoreDAO.address,
  })

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
func.dependencies = []
