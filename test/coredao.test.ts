import { expect } from "chai"
import { BigNumber } from "ethers"
import { ethers, deployments } from "hardhat"
import { CoreDAO } from "../types"
import { blockNumber, getBigNumber, impersonate } from "./utilities"

let coredao: CoreDAO

describe("CoreDAO", function () {
  beforeEach(async function () {
    await deployments.fixture()

    coredao = await ethers.getContract("CoreDAO")
  })
})
