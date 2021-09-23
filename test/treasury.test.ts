import { expect } from "chai"
import { Signer, utils, constants } from "ethers"
import { ethers, upgrades } from "hardhat"
import { CoreDAOTreasury, CoreDAO } from "../types"

describe("CoreDAOTreasury", function () {
  let owner: Signer
  let alice: Signer
  let bob: Signer
  let treasury: CoreDAOTreasury
  let coredao: CoreDAO
  const startingCoreDAOAmount = utils.parseEther("1000")

  beforeEach(async function () {
    const accounts = await ethers.getSigners()
    owner = accounts[0]
    alice = accounts[1]
    bob = accounts[2]

    const CoreDAOTreasuryFactory = await ethers.getContractFactory("CoreDAOTreasury")
    treasury = (await upgrades.deployProxy(CoreDAOTreasuryFactory, [])) as CoreDAOTreasury

    const CoreDaoFactory = await ethers.getContractFactory("CoreDAO")
    coredao = (await CoreDaoFactory.deploy(startingCoreDAOAmount, treasury.address)) as CoreDAO
  })

  describe("check initial state", async () => {
    it("check owner", async () => {
      expect(await treasury.owner()).to.equal(await owner.getAddress())
    })

    // it("check coredao", async () => {
    //   expect(await treasury.coreDAO()).to.equal(coredao.address)
    // })
  })

  describe("#pay", async () => {
    const payAmount = utils.parseEther("1")

    it("revert if msg.sender is not owner", async () => {
      await expect(treasury.connect(alice).pay(await alice.getAddress(), payAmount, constants.AddressZero, "test")).to.be.revertedWith(
        "Ownable: caller is not the owner"
      )
    })

    it.only("pay ether", async () => {
      const treasuryBalance = utils.parseEther("10")
      await owner.sendTransaction({
        to: treasury.address,
        value: treasuryBalance,
      })

      const aliceBalanceBefore = await alice.getBalance()
      const tx = await treasury.connect(owner).pay(await alice.getAddress(), payAmount, constants.AddressZero, "test")
      expect(tx)
        .to.emit(treasury, "Payment")
        .withArgs(await alice.getAddress(), constants.AddressZero, payAmount, "test")

      expect(await owner.provider!.getBalance(treasury.address)).to.equal(treasuryBalance.sub(payAmount))
      expect(await alice.getBalance()).to.equal(aliceBalanceBefore.add(payAmount))
    })

    it("pay ERC20 token", async () => {
      const MockTokenFactory = await ethers.getContractFactory("MockToken")
      const mockToken = await MockTokenFactory.deploy()
      const treasuryBalance = utils.parseEther("100")
      await mockToken.connect(owner).transfer(treasury.address, treasuryBalance)

      const tx = await treasury.connect(owner).pay(await alice.getAddress(), payAmount, mockToken.address, "test")
      expect(tx)
        .to.emit(treasury, "Payment")
        .withArgs(await alice.getAddress(), mockToken.address, payAmount, "test")

      expect(await mockToken.balanceOf(treasury.address)).to.equal(treasuryBalance.sub(payAmount))
      expect(await mockToken.balanceOf(await alice.getAddress())).to.equal(payAmount)
    })
  })
})
