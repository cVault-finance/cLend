import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { ethers, network } from "hardhat"
import { CLending, CoreDAO, CoreDAOTreasury, CoreGovernor, IERC20 } from "../types"
import { getBigNumber, impersonate } from "../test/utilities"
import { constants } from "../constants"

const DAI_RICH = "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7";
const CORE_RICH = "0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF";

const COREDAO_AMOUNT = "123123456789123456789";
const CORE_AMOUNT = "123123456789123456789";
const DAI_AMOUNT = "50000872817263748392736";
const LENDING_AMOUNT = getBigNumber(2_000_000);

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  // Run on hardhat local node only
  if (network.live && process.env.HARDHAT_NETWORK_LIVE) {
    console.log("Configuring account1 for website development...")
    const { deployments, getNamedAccounts } = hre
    const { deploy } = deployments

    const [, account1] = await ethers.getSigners()

    const Lending = await ethers.getContract<CLending>("CLending")
    const CoreDAO = await ethers.getContract<CoreDAO>("CoreDAO")
    const CoreDAOTreasury = await ethers.getContract<CoreDAOTreasury>("CoreDAOTreasury")
    const Core = await ethers.getContractAt<IERC20>("IERC20", constants.CORE)
    const Dai = await ethers.getContractAt<IERC20>("IERC20", constants.DAI)

    await impersonate(CoreDAOTreasury.address)
    await impersonate(DAI_RICH)
    await impersonate(CORE_RICH)

    const daiRichSigner = await ethers.getSigner(DAI_RICH);
    const coreRichSigner = await ethers.getSigner(CORE_RICH);

    const coreDAOTreasurySigner = await ethers.getSigner(CoreDAOTreasury.address)

    await CoreDAO.connect(coreDAOTreasurySigner).issue(account1.address, COREDAO_AMOUNT)
    await Core.connect(coreRichSigner).transfer(account1.address, CORE_AMOUNT)
    await Dai.connect(daiRichSigner).transfer(account1.address, DAI_AMOUNT)
    await Dai.connect(daiRichSigner).transfer(Lending.address, LENDING_AMOUNT)

    console.table({
      Account: account1.address,
      CoreDAO: CoreDAO.address,
      CoreDAOTreasury: CoreDAOTreasury.address,
      Core: Core.address,
      Dai: Dai.address,
      Lending: Lending.address
    })
  }
}

export default func
func.tags = ["SetupWebsite"]
func.dependencies = ["Init"]
