import { expect } from "chai"
import { BigNumber, Signer } from "ethers"
import { ethers, deployments } from "hardhat"
import { CoreDAO, CoreGovernor, IERC20, TimelockController } from "../types"
import { TimelockController__factory } from "../types/factories/TimelockController__factory"
import { getBigNumber, impersonate } from "./utilities"
import { constants } from "../constants"
import { parseEther } from "ethers/lib/utils"

describe("CoreGovernor", async () => {
  let coredao: CoreDAO
  let coreGovernor: CoreGovernor

  beforeEach(async () => {
    await deployments.fixture()

    coredao = await ethers.getContract("CoreDao")
    coreGovernor = await ethers.getContract("CoreGovernor")
  })

  it("should be deployed", async () => {
    const [deployer, account1] = await ethers.getSigners()
  })
})
