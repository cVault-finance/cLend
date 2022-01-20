import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { ethers, network } from "hardhat"
import { CLending, CoreDAO, CoreDAOTreasury, CoreGovernor, IERC20 } from "../types"
import { getBigNumber, impersonate } from "../test/utilities"
import { constants } from "../constants"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  // Run on hardhat local node only
  if (network.live && process.env.HARDHAT_NETWORK_LIVE) {
    console.log("Configuring account1 for website development...")
    const { deployments, getNamedAccounts } = hre
    const { deploy } = deployments

    const { deployer } = await getNamedAccounts()
    const [, account1] = await ethers.getSigners()

    const Lending = await ethers.getContract<CLending>("CLending")
    const CoreDAO = await ethers.getContract<CoreDAO>("CoreDAO")
    const CoreDAOTreasury = await ethers.getContract<CoreDAOTreasury>("CoreDAOTreasury")
    const Core = await ethers.getContractAt<IERC20>("IERC20", constants.CORE)
    const Dai = await ethers.getContractAt<IERC20>("IERC20", constants.DAI)

    await impersonate(CoreDAOTreasury.address)
    await impersonate(constants.CORE_MULTISIG)

    const coreDeployerSigner = await ethers.getSigner(constants.CORE_MULTISIG)
    const coreDAOTreasurySigner = await ethers.getSigner(CoreDAOTreasury.address)

    await CoreDAO.connect(coreDAOTreasurySigner).issue(account1.address, getBigNumber(12345))
    await Core.connect(coreDeployerSigner).transfer(account1.address, getBigNumber(321))
    await Dai.connect(coreDeployerSigner).transfer(account1.address, getBigNumber(50000))
    await Dai.connect(coreDeployerSigner).transfer(Lending.address, await Dai.balanceOf(coreDeployerSigner.address))

    console.table({
      CoreDAO: CoreDAO.address,
      CoreDAOTreasury: CoreDAOTreasury.address,
      Core: Core.address,
      Dai: Dai.address,
      Lending: Lending.address,
    })
  }
}

export default func
func.tags = ["SetupWebsite"]
func.dependencies = ["CoreDAOTreasury", "CoreDAO"]
