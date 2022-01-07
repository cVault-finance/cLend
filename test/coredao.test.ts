import { expect } from "chai"
import { Signer, utils } from "ethers"
import hre, { ethers, deployments } from "hardhat"
import { CoreDAO, CoreDAOTreasury } from "../types"

describe("CoreDAO", function () {
  let alice: Signer
  let bob: Signer
  let coredao: CoreDAO
  let treasury: CoreDAOTreasury
  const startingCoreDAOAmount = 30000000
  const NAME = "CORE DAO"
  const SYMBOL = "CoreDAO"

  beforeEach(async function () {
    await deployments.fixture()

    const accounts = await ethers.getSigners()
    alice = accounts[1]
    bob = accounts[2]
    coredao = await ethers.getContract("CoreDAO")
    treasury = await ethers.getContract("CoreDAOTreasury")
  })

  describe("check initial state", () => {
    it("check tokenomics", async () => {
      expect(await coredao.name()).to.equal(NAME)
      expect(await coredao.symbol()).to.equal(SYMBOL)
    })

    it("check treasury", async () => {
      expect(await coredao.CORE_DAO_TREASURY()).to.equal(treasury.address)
    })

    it("check treasury balance", async () => {
      expect(await coredao.balanceOf(treasury.address)).to.equal(startingCoreDAOAmount)
    })
  })

  describe("#issue function", () => {
    it("revert if msg.sender is not treasury", async () => {
      expect(coredao.connect(alice).issue(await bob.getAddress(), "1")).to.be.revertedWith("NOT_TREASURY")
    })

    it("should issue DAO token by treasury", async () => {
      await alice.sendTransaction({
        to: treasury.address,
        value: utils.parseEther("1"),
      })

      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [treasury.address],
      })

      const treasurySigner = await ethers.getSigner(treasury.address)

      const amount = ethers.utils.parseEther("10")
      await coredao.connect(treasurySigner).issue(await alice.getAddress(), amount)
      expect(await coredao.balanceOf(await alice.getAddress())).to.equal(amount)
    })
  })
})
