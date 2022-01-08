import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { ethers, network } from "hardhat"
import { CoreDAO, CoreDAOTreasury, CoreGovernor, CoreVaultV3 } from "../types"

const TIMELOCK_CONTROLLER_MIN_DELAY = 3 * 60 * 60 * 24 // 3 days
const VAULT = "0xC5cacb708425961594B63eC171f4df27a9c0d8c9" // Now hold the ERC20Votes implementation for stCoreDAO (Voting weight)

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy } = deployments

  const { deployer } = await getNamedAccounts()
  const CoreDAOTreasury = await ethers.getContract<CoreDAOTreasury>("CoreDAOTreasury")

  await deploy("TimelockController", {
    from: deployer,
    args: [TIMELOCK_CONTROLLER_MIN_DELAY, [], []],
    log: true,
    deterministicDeployment: false,
  })
  const TimelockController = await ethers.getContract("TimelockController")

  await deploy("CoreGovernor", {
    from: deployer,
    args: [VAULT, TimelockController.address],
    log: true,
    deterministicDeployment: false,
  })
  const CoreGovernor = await ethers.getContract<CoreGovernor>("CoreGovernor")

  // Set the permissions based on OZ recommendations
  // https://docs.openzeppelin.com/contracts/4.x/governance
  const PROPOSER_ROLE = await TimelockController.PROPOSER_ROLE()
  const EXECUTOR_ROLE = await TimelockController.EXECUTOR_ROLE()
  const TIMELOCK_ADMIN_ROLE = await TimelockController.TIMELOCK_ADMIN_ROLE()

  const deployerSigner = await ethers.getSigner(deployer)

  // Proposer role is in charge of queueing operations: this is the
  // role the Governor instance should be granted, and it should likely be the only proposer in the system.
  await TimelockController.connect(deployerSigner).grantRole(PROPOSER_ROLE, CoreGovernor.address)

  // he Executor role is in charge of executing already available operations: we can assign this role
  // to the special zero address to allow anyone to execute (if operations can be particularly time sensitive,
  // the Governor should be made Executor instead).
  await TimelockController.connect(deployerSigner).grantRole(EXECUTOR_ROLE, ethers.constants.AddressZero)

  // Lastly, there is the Admin role, which can grant and revoke the two previous roles: this is a
  // very sensitive role that will be granted automatically to both deployer and timelock itself, but
  // should be renounced by the deployer after setup.
  await TimelockController.connect(deployerSigner).revokeRole(TIMELOCK_ADMIN_ROLE, deployer)

  if (network.live) {
    // Set the Treasury ownership to the governance
    console.log("Transferring CoreDAOTreasury ownership to CoreGovernor...")
    await CoreDAOTreasury.connect(deployerSigner).transferOwnership(CoreGovernor.address)
  }
}

export default func
func.tags = ["CoreGovernor"]
func.dependencies = ["CoreDAOTreasury"]
