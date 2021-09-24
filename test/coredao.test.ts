import { expect } from "chai"
import { Signer } from "ethers"
import { ethers, deployments } from "hardhat"
import { CoreDAO } from "../types"

describe("CoreDAO", function () {
  let treasury: Signer
  let alice: Signer
  let bob: Signer
  let coredao: CoreDAO
  const startingCoreDAOAmount = ethers.utils.parseEther("1000")
  const NAME = "CORE DAO"
  const SYMBOL = "coreDAO"

  beforeEach(async function () {
    await deployments.fixture()

    const accounts = await ethers.getSigners()
    treasury = accounts[0]
    alice = accounts[1]
    bob = accounts[2]
    const CoreDaoFactory = await ethers.getContractFactory("CoreDAO")
    coredao = (await CoreDaoFactory.deploy(startingCoreDAOAmount, await treasury.getAddress())) as CoreDAO
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
      expect(coredao.connect(alice).issue("1", await bob.getAddress())).to.be.revertedWith("Not treasury")
    })

    it("should issue DAO token by treasury", async () => {
      const amount = ethers.utils.parseEther("10")
      await coredao.connect(treasury).issue(amount, await alice.getAddress())
      expect(await coredao.balanceOf(await alice.getAddress())).to.equal(amount)
    })
  })
})
