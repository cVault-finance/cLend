import { expect } from "chai"
import { BigNumber, Signer } from "ethers"
import { ethers, deployments } from "hardhat"
import { CoreDAO, CoreGovernor, IERC20, TimelockController } from "../types"
import { TimelockController__factory } from "../types/factories/TimelockController__factory"
import { getBigNumber, impersonate } from "./utilities"
import { constants } from "../constants"
import { parseEther } from "ethers/lib/utils"

describe("CoreGovernor", async () => {
  let treasury: Signer
  let coredao: CoreDAO
  let coreGovernor: CoreGovernor
  let timeLockController: TimelockController
  const startingCoreDAOAmount = ethers.utils.parseEther("1000")
  const minDelay = 3 * 60 * 60 * 24

  beforeEach(async () => {
    await deployments.fixture()

    const accounts = await ethers.getSigners()
    treasury = accounts[0]
    const CoreDaoFactory = await ethers.getContractFactory("CoreDAO")
    coredao = (await CoreDaoFactory.deploy(startingCoreDAOAmount, await treasury.getAddress())) as CoreDAO

    const TimeLockControllerFactory = new TimelockController__factory(treasury)
    timeLockController = await TimeLockControllerFactory.deploy(minDelay, [], [])

    const CoreGovernorFactory = await ethers.getContractFactory("CoreGovernor")
    coreGovernor = (await CoreGovernorFactory.deploy(coredao.address, timeLockController.address)) as CoreGovernor
  })

  it("should be deployed", async () => {
    const [deployer, account1] = await ethers.getSigners()
  })
})
