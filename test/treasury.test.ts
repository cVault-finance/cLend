import { expect } from "chai"
import { Signer, utils, constants as etherConstants, Contract, BigNumber } from "ethers"
import hre, { ethers, deployments } from "hardhat"
import { impersonate } from "./utilities"
import { constants } from "../constants"
import { CoreDAOTreasury, CoreDAO } from "../types"
import { IERC20__factory } from "../types/factories/IERC20__factory"

describe("CoreDAOTreasury", function () {
  let owner: Signer
  let alice: Signer
  let bob: Signer
  let treasury: CoreDAOTreasury
  let coredao: CoreDAO
  let coreVault: Signer
  let LP1_VOUCHER: Contract
  let LP2_VOUCHER: Contract
  let LP3_VOUCHER: Contract
  let DAO_TOKENS_IN_LP1: BigNumber
  let DAO_TOKENS_IN_LP2: BigNumber
  let DAO_TOKENS_IN_LP3: BigNumber

  beforeEach(async function () {
    await deployments.fixture()

    await impersonate(constants.CORE_VAULT)

    const accounts = await ethers.getSigners()
    owner = accounts[0]
    alice = accounts[1]
    bob = accounts[2]

    coredao = await ethers.getContract("CoreDAO")
    treasury = await ethers.getContract("CoreDAOTreasury")

    coreVault = await ethers.provider.getSigner(constants.CORE_VAULT)

    LP1_VOUCHER = IERC20__factory.connect(await treasury.LP1_VOUCHER(), owner)
    LP2_VOUCHER = IERC20__factory.connect(await treasury.LP2_VOUCHER(), owner)
    LP3_VOUCHER = IERC20__factory.connect(await treasury.LP3_VOUCHER(), owner)
    DAO_TOKENS_IN_LP1 = await treasury.DAO_TOKENS_IN_LP1()
    DAO_TOKENS_IN_LP2 = await treasury.DAO_TOKENS_IN_LP2()
    DAO_TOKENS_IN_LP3 = await treasury.DAO_TOKENS_IN_LP3()
  })

  describe("check initial state", async () => {
    it("check owner", async () => {
      expect(await treasury.owner()).to.equal(await owner.getAddress())
    })

    it("check coredao", async () => {
      expect(await treasury.coreDAO()).to.equal(coredao.address)
    })
  })

  describe("#pay function", async () => {
    const payAmount = utils.parseEther("1")

    it("revert if msg.sender is not owner", async () => {
      await expect(treasury.connect(alice).pay(etherConstants.AddressZero, await alice.getAddress(), payAmount, "test")).to.be.revertedWith(
        "Ownable: caller is not the owner"
      )
    })

    it("should pay ether if token address is zero", async () => {
      const treasuryBalance = utils.parseEther("10")
      await owner.sendTransaction({
        to: treasury.address,
        value: treasuryBalance,
      })

      const aliceBalanceBefore = await alice.getBalance()
      const tx = await treasury.connect(owner).pay(etherConstants.AddressZero, await alice.getAddress(), payAmount, "test")
      expect(tx)
        .to.emit(treasury, "Payment")
        .withArgs(await alice.getAddress(), etherConstants.AddressZero, payAmount, "test")

      expect(await owner.provider!.getBalance(treasury.address)).to.equal(treasuryBalance.sub(payAmount))
      expect(await alice.getBalance()).to.equal(aliceBalanceBefore.add(payAmount))
    })

    it("should pay ERC20 token if token address is not zero", async () => {
      const MockTokenFactory = await ethers.getContractFactory("MockToken")
      const mockToken = await MockTokenFactory.deploy()
      const treasuryBalance = utils.parseEther("100")
      await mockToken.connect(owner).transfer(treasury.address, treasuryBalance)

      const tx = await treasury.connect(owner).pay(mockToken.address, await alice.getAddress(), payAmount, "test")
      expect(tx)
        .to.emit(treasury, "Payment")
        .withArgs(await alice.getAddress(), mockToken.address, payAmount, "test")

      expect(await mockToken.balanceOf(treasury.address)).to.equal(treasuryBalance.sub(payAmount))
      expect(await mockToken.balanceOf(await alice.getAddress())).to.equal(payAmount)
    })
  })

  describe("#wrapVouchers function", async () => {
    it("revert if mint amount is zero", async () => {
      await expect(treasury.connect(alice).wrapVouchers()).to.be.revertedWith("NOTHING_TO_WRAP")
    })

    it("should wrap vouchers", async () => {
      const MockEthDistributorFactory = await ethers.getContractFactory("MockEthDistributor")
      const mockEthDistributor = await MockEthDistributorFactory.deploy()

      await alice.sendTransaction({
        to: mockEthDistributor.address,
        value: utils.parseEther("1"),
      })
      await mockEthDistributor.distribute(await coreVault.getAddress())

      const LP1_BALANCE = utils.parseEther("1")
      const LP2_BALANCE = utils.parseEther("0.001")
      const LP3_BALANCE = utils.parseEther("3")

      await LP1_VOUCHER.connect(coreVault).transfer(await alice.getAddress(), LP1_BALANCE)
      await LP1_VOUCHER.connect(alice).approve(treasury.address, LP1_BALANCE)
      await LP2_VOUCHER.connect(coreVault).transfer(await alice.getAddress(), LP2_BALANCE)
      await LP2_VOUCHER.connect(alice).approve(treasury.address, LP2_BALANCE)
      await LP3_VOUCHER.connect(coreVault).transfer(await alice.getAddress(), LP3_BALANCE)
      await LP3_VOUCHER.connect(alice).approve(treasury.address, LP3_BALANCE)

      const deadAddress = "0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF"
      const deadBalanceLp1 = await LP1_VOUCHER.balanceOf(deadAddress)
      const deadBalanceLp2 = await LP2_VOUCHER.balanceOf(deadAddress)
      const deadBalanceLp3 = await LP3_VOUCHER.balanceOf(deadAddress)

      await treasury.connect(alice).wrapVouchers()

      const mintAmount = LP1_BALANCE.mul(DAO_TOKENS_IN_LP1).add(LP2_BALANCE.mul(DAO_TOKENS_IN_LP2)).add(LP3_BALANCE.mul(DAO_TOKENS_IN_LP3))
      expect(await LP1_VOUCHER.balanceOf(await alice.getAddress())).to.equal("0")
      expect(await LP1_VOUCHER.balanceOf(deadAddress)).to.equal(deadBalanceLp1.add(LP1_BALANCE))
      expect(await LP2_VOUCHER.balanceOf(await alice.getAddress())).to.equal("0")
      expect(await LP2_VOUCHER.balanceOf(deadAddress)).to.equal(deadBalanceLp2.add(LP2_BALANCE))
      expect(await LP3_VOUCHER.balanceOf(await alice.getAddress())).to.equal("0")
      expect(await LP3_VOUCHER.balanceOf(deadAddress)).to.equal(deadBalanceLp3.add(LP3_BALANCE))
      expect(await coredao.balanceOf(await alice.getAddress())).to.equal(mintAmount)
    })
  })
})
