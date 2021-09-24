import { expect } from "chai"
import { Signer, utils, constants, Contract, BigNumber } from "ethers"
import hre, { ethers, upgrades } from "hardhat"
import { CoreDAOTreasury, CoreDAO } from "../types"
import { IERC20__factory } from "../types/factories/IERC20__factory"

const TokenHolder = "0xc5cacb708425961594b63ec171f4df27a9c0d8c9"

describe("CoreDAOTreasury", function () {
  let owner: Signer
  let alice: Signer
  let bob: Signer
  let treasury: CoreDAOTreasury
  let coredao: CoreDAO
  let tokenHolder: Signer
  let LP1_VOUCHER: Contract
  let LP2_VOUCHER: Contract
  let LP3_VOUCHER: Contract
  let DAO_TOKENS_IN_LP1: BigNumber
  let DAO_TOKENS_IN_LP2: BigNumber
  let DAO_TOKENS_IN_LP3: BigNumber
  const startingCoreDAOAmount = utils.parseEther("1000")

  beforeEach(async function () {
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [TokenHolder],
    })

    const accounts = await ethers.getSigners()
    owner = accounts[0]
    alice = accounts[1]
    bob = accounts[2]

    const CoreDAOTreasuryFactory = await ethers.getContractFactory("CoreDAOTreasury")
    treasury = (await upgrades.deployProxy(CoreDAOTreasuryFactory, {
      kind: "transparent",
      initializer: false,
    })) as CoreDAOTreasury

    const CoreDaoFactory = await ethers.getContractFactory("CoreDAO")
    coredao = (await CoreDaoFactory.deploy(startingCoreDAOAmount, treasury.address)) as CoreDAO
    await treasury.initialize(coredao.address)

    tokenHolder = await ethers.provider.getSigner(TokenHolder)

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

  describe("#pay", async () => {
    const payAmount = utils.parseEther("1")

    it("revert if msg.sender is not owner", async () => {
      await expect(treasury.connect(alice).pay(await alice.getAddress(), payAmount, constants.AddressZero, "test")).to.be.revertedWith(
        "Ownable: caller is not the owner"
      )
    })

    it("pay ether", async () => {
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

  describe("#wrapVouchers", async () => {
    it("revert if mint amount is zero", async () => {
      await expect(treasury.connect(alice).wrapVouchers()).to.be.revertedWith("No tokens to wrap")
    })

    it("wrap vouchers", async () => {
      const MockEthDistributorFactory = await ethers.getContractFactory("MockEthDistributor")
      const mockEthDistributor = await MockEthDistributorFactory.deploy()

      await alice.sendTransaction({
        to: mockEthDistributor.address,
        value: utils.parseEther("1"),
      })
      await mockEthDistributor.distribute(await tokenHolder.getAddress())

      const LP1_BALANCE = utils.parseEther("1")
      const LP2_BALANCE = utils.parseEther("0.001")
      const LP3_BALANCE = utils.parseEther("3")

      await LP1_VOUCHER.connect(tokenHolder).transfer(await alice.getAddress(), LP1_BALANCE)
      await LP1_VOUCHER.connect(alice).approve(treasury.address, LP1_BALANCE)
      await LP2_VOUCHER.connect(tokenHolder).transfer(await alice.getAddress(), LP2_BALANCE)
      await LP2_VOUCHER.connect(alice).approve(treasury.address, LP2_BALANCE)
      await LP3_VOUCHER.connect(tokenHolder).transfer(await alice.getAddress(), LP3_BALANCE)
      await LP3_VOUCHER.connect(alice).approve(treasury.address, LP3_BALANCE)

      const deadAddress = "0x000000000000000000000000000000000000dead"
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
