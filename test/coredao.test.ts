import { expect } from "chai"
import { Signer } from "ethers"
import { ethers, deployments } from "hardhat"
import { CoreDAO } from "../types"

let coredao: CoreDAO
let accounts: Signer[]
let treasury: Signer
const startingCoreDAOAmount = ethers.utils.parseEther("1000")
const NAME = "CORE DAO"
const SYMBOL = "coreDAO"

describe("CoreDAO", function () {
  beforeEach(async function () {
    await deployments.fixture()

    accounts = await ethers.getSigners()
    treasury = accounts[0]
    const coreDaoFactory = await ethers.getContractFactory("CoreDAO")
    coredao = (await coreDaoFactory.deploy(startingCoreDAOAmount, await treasury.getAddress())) as CoreDAO
  })

  describe("check initial state", () => {
    it("check tokenomics", async () => {
      expect(await coredao.name()).to.equal(NAME)
      expect(await coredao.symbol()).to.equal(SYMBOL)
    })

    it("check treasury", async () => {
      expect(await coredao.CORE_DAO_TREASURY()).to.equal(await treasury.getAddress())
    })

    it("check treasury balance", async () => {
      expect(await coredao.balanceOf(await treasury.getAddress())).to.equal(startingCoreDAOAmount)
    })
  })

  describe("#issue function", () => {
    it("revert if msg.sender is not treasury", async () => {
      expect(coredao.connect(accounts[1]).issue("1", await accounts[2].getAddress())).to.revertedWith("Not treasury")
    })

    it("should issue DAO token by treasury", async () => {
      const amount = ethers.utils.parseEther("10")
      await coredao.connect(treasury).issue(amount, await accounts[1].getAddress())
      expect(await coredao.balanceOf(await accounts[1].getAddress())).to.equal(amount)
    })
  })
})
