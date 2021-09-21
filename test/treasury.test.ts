import { expect } from "chai"
import { BigNumber } from "ethers"
import { ethers, deployments } from "hardhat"
import { CoreDAOTreasury } from "../types"
import { blockNumber, getBigNumber, impersonate } from "./utilities"

let treasury: CoreDAOTreasury

describe("CoreDAOTreasury", function () {
  beforeEach(async function () {
    await deployments.fixture()

    treasury = await ethers.getContract("CoreDAOTreasury")
  })

  it("should not be able to mint", async () => {
    const [deployer, account1] = await ethers.getSigners()
  })
})
