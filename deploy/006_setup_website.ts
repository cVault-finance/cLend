import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { ethers, network } from "hardhat"
import { CLending, CoreDAO, CoreDAOTreasury, CoreGovernor, IERC20 } from "../types"
import { getBigNumber, impersonate } from "../test/utilities"
import { constants } from "../constants"

const LP1_VOUCHER = "0xF6Dd68031a22c8A3F1e7a424cE8F43a1e1A3be3E"
const LP2_VOUCHER = "0xb8ee07B5ED2FF9dae6C504C9dEe84151F844a591"
const LP3_VOUCHER = "0xcA00F8eef4cE1F9183E06fA25fE7872fEDcf7456"
const xRevert = "0xd5b47b80668840e7164c1d1d81af8a9d9727b421"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  // Run on hardhat local node only
  if (network.live && process.env.HARDHAT_NETWORK_LIVE) {
    console.log("Configuring account1 for website development...")
    const { deployments, getNamedAccounts } = hre
    const { deploy } = deployments

    const { deployer } = await getNamedAccounts()
    const [, account1] = await ethers.getSigners()

    const xRevertSigner = await ethers.getSigner(xRevert)
    const Lending = await ethers.getContract<CLending>("CLending")
    const CoreDAO = await ethers.getContract<CoreDAO>("CoreDAO")
    const CoreDAOTreasury = await ethers.getContract<CoreDAOTreasury>("CoreDAOTreasury")
    const Core = await ethers.getContractAt<IERC20>("IERC20", constants.CORE)
    const Dai = await ethers.getContractAt<IERC20>("IERC20", constants.DAI)

    await impersonate(CoreDAOTreasury.address)
    await impersonate(constants.CORE_MULTISIG)
    await impersonate(xRevert)

    const coreDeployerSigner = await ethers.getSigner(constants.CORE_MULTISIG)
    const coreDAOTreasurySigner = await ethers.getSigner(CoreDAOTreasury.address)

    const VoucherLp1 = await ethers.getContractAt<IERC20>("IERC20", LP1_VOUCHER)
    const VoucherLp2 = await ethers.getContractAt<IERC20>("IERC20", LP2_VOUCHER)
    const VoucherLp3 = await ethers.getContractAt<IERC20>("IERC20", LP3_VOUCHER)

    let lp1Amount = await VoucherLp1.balanceOf(xRevert)
    let lp2Amount = await VoucherLp2.balanceOf(xRevert)
    let lp3Amount = await VoucherLp3.balanceOf(xRevert)

    await VoucherLp1.connect(xRevertSigner).approve(account1.address, lp1Amount)
    await VoucherLp2.connect(xRevertSigner).approve(account1.address, lp2Amount)
    await VoucherLp3.connect(xRevertSigner).approve(account1.address, lp3Amount)

    await VoucherLp1.connect(xRevertSigner).transfer(account1.address, lp1Amount)
    await VoucherLp2.connect(xRevertSigner).transfer(account1.address, lp2Amount)
    await VoucherLp3.connect(xRevertSigner).transfer(account1.address, lp3Amount)

    await CoreDAO.connect(coreDAOTreasurySigner).issue(account1.address, getBigNumber(12345))
    await Core.connect(coreDeployerSigner).transfer(account1.address, getBigNumber(321))
    await Dai.connect(coreDeployerSigner).transfer(account1.address, getBigNumber(50000))
    await Dai.connect(coreDeployerSigner).transfer(Lending.address, await Dai.balanceOf(coreDeployerSigner.address))

    console.table({
      Account: account1.address,
      CoreDAO: CoreDAO.address,
      CoreDAOTreasury: CoreDAOTreasury.address,
      Core: Core.address,
      Dai: Dai.address,
      Lending: Lending.address,
      VoucherLp1: VoucherLp1.address,
      VoucherLp2: VoucherLp2.address,
      VoucherLp3: VoucherLp3.address,
    })
  }
}

export default func
func.tags = ["SetupWebsite"]
func.dependencies = ["CoreDAOTreasury", "CoreDAO"]
