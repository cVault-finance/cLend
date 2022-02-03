import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { ethers, network } from "hardhat"
import { CLending, CoreDAOTreasury, CORE, TransferChecker, MockProxyAdmin } from "../types"
import { constants } from "../constants"
import { impersonate } from "../test/utilities"
import { expect } from "chai"

const YEARLY_PERCENT_INTEREST = 20
const LOAN_DEFAULT_TRESHOLD = 110
const CORE_TOKEN_COLLATERABILITY = 5500
const DEPLOYER = "0x5A16552f59ea34E44ec81E58b3817833E9fD5436"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  await impersonate(DEPLOYER)
  const cvaultDeployer = await ethers.getSigner(DEPLOYER)

 /* await deploy("CLending", {
    from: deployer,
    args: [],
    log: true,
    deterministicDeployment: false,
    proxy: {
      owner: constants.PROXY_ADMIN,
      proxyContract: "TransparentUpgradeableProxy",
    },
  })

  const CLending = await ethers.getContract<CLending>("CLending")
*/

  const CLending = await ethers.getContractAt<CLending>("CLending", "0x54B276C8a484eBF2a244D933AF5FFaf595ea58c5")
  await deployments.save("CLending", {
    abi: require("../abi/CLending.json"),
    address: CLending.address,
  })

  
  ///// Example of upgrading
  await deploy("CLendingImplementationFix", {
    from: deployer,
    args: [],
    log: true,
    contract: "CLending",
    deterministicDeployment: false,
  })
  const CLendingImplementationFix = await ethers.getContract<CLending>("CLendingImplementationFix")
  const TeamProxy = await ethers.getContractAt<MockProxyAdmin>("MockProxyAdmin", "0x9cb1eEcCd165090a4a091209E8c3a353954B1f0f")
  await TeamProxy.connect(cvaultDeployer).upgrade(CLending.address, CLendingImplementationFix.address)
  //////

  const CoreDAO = await ethers.getContract("CoreDAO")
  const CORE = await ethers.getContractAt<CORE>("CORE", constants.CORE)
  const CoreDAOTreasury = await ethers.getContract<CoreDAOTreasury>("CoreDAOTreasury")

  if (!network.live || network.name == "hardhat") {
    await CLending.connect(cvaultDeployer).initialize(
      CoreDAOTreasury.address,
      CoreDAO.address,
      YEARLY_PERCENT_INTEREST,
      LOAN_DEFAULT_TRESHOLD,
      CORE_TOKEN_COLLATERABILITY
    )
  } else {
    await CLending.initialize(
      CoreDAOTreasury.address,
      CoreDAO.address,
      YEARLY_PERCENT_INTEREST,
      LOAN_DEFAULT_TRESHOLD,
      CORE_TOKEN_COLLATERABILITY
    )
  }

  // disable CORE FoT on lending contract
  const transferCheckerAddress = await CORE.transferCheckerAddress()
  const transferChecker = await ethers.getContractAt<TransferChecker>("TransferChecker", transferCheckerAddress)

  console.log(`Adding CLending ${CLending.address} to CORE noFeeList...`)

  if (network.live && !process.env.HARDHAT_NETWORK_LIVE) {
    await transferChecker.editNoFeeRecipentList(CLending.address, true)
  } else {
    await impersonate(constants.CORE_MULTISIG)
    const coreMultiSig = await ethers.getSigner(constants.CORE_MULTISIG)
    await transferChecker.connect(coreMultiSig).editNoFeeRecipentList(CLending.address, true)
    await transferChecker.connect(coreMultiSig).editNoFeeList(CLending.address, true)
  }

  console.log("done")
  expect(await transferChecker.noFeeRecipent(CLending.address)).to.be.true
}

export default func
func.tags = ["CoreDAOMigrator"]
func.dependencies = ["CoreDAO"]
