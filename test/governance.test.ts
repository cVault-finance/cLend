import { expect } from "chai"
import { BigNumber } from "ethers"
import { ethers, deployments } from "hardhat"
import { CoreDAO, CoreGovernor, IERC20 } from "../types"
import { getBigNumber, impersonate } from "./utilities"
import { constants } from "../constants"
import { parseEther } from "ethers/lib/utils"

let coredao: CoreDAO
let coreGovernor: CoreGovernor

describe("CoreGovernor", async () => {
  beforeEach(async () => {
    await deployments.fixture()

    coredao = await ethers.getContract("CoreDAO")
    coreGovernor = await ethers.getContract("CoreGovernor")
  })

  it("should be deployed", async () => {
    const [deployer, account1] = await ethers.getSigners()
  })
})
