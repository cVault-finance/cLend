import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { ethers, network } from "hardhat"
import { CLending, CoreDAO, CoreDAOTreasury } from "../types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
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

  const CLending = await ethers.getContractAt<CLending>("CLending", "0x54B276C8a484eBF2a244D933AF5FFaf595ea58c5")
  await deployments.save("CLending", {
    abi: require("../abi/CLending.json"),
    address: CLending.address,
  })
}

export default func
func.tags = ["Init"]
func.dependencies = []
