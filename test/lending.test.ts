import { expect } from "chai"
import { ethers, deployments } from "hardhat"
import { CLending, IERC20 } from "../types"
import { blockNumber, getBigNumber, impersonate, latest } from "./utilities"
import { constants } from "../constants"
import { BigNumber, Signer, utils } from "ethers"

describe("Lending", function () {
  let cLending: CLending
  let coreDAOTreasury
  let yearlyPercentInterest
  let loanDefaultThresholdPercent
  let coreCollaterability
  let coreDaiCollaterability
  let CORE: IERC20
  let DAI: IERC20
  let owner: Signer
  let alice: Signer
  let bob: Signer

  beforeEach(async function () {
    const accounts = await ethers.getSigners()
    owner = accounts[0]
    alice = accounts[1]
    bob = accounts[2]

    await deployments.fixture()

    cLending = await ethers.getContract("CLending")
    coreDAOTreasury = await cLending.coreDAOTreasury()
    yearlyPercentInterest = await cLending.yearlyPercentInterest()
    loanDefaultThresholdPercent = await cLending.loanDefaultThresholdPercent()
    coreCollaterability = await cLending.collaterabilityOfToken(constants.CORE)
    coreDaiCollaterability = await cLending.loanDefaultThresholdPercent()

    CORE = await ethers.getContractAt<IERC20>("IERC20", constants.CORE)
    DAI = await ethers.getContractAt<IERC20>("IERC20", constants.DAI)

    // Give some CORE to alice
    await impersonate(constants.CORE_MULTISIG)
    const coreMultiSigSigner = await ethers.getSigner(constants.CORE_MULTISIG)
    await CORE.connect(coreMultiSigSigner).transfer(await alice.getAddress(), getBigNumber(123))

    // Fund the lending contract with DAI
    await DAI.connect(coreMultiSigSigner).transfer(cLending.address, await DAI.balanceOf(coreMultiSigSigner.address))
  })

  describe("#receive function", () => {
    it("revert if ether sent to cLend", async () => {
      await expect(
        alice.sendTransaction({
          to: cLending.address,
          value: utils.parseEther("1"),
        })
      ).to.revertedWith("ETH is not accepted")
    })
  })

  describe("#changeLoanTerms function", () => {
    it("revert if msg.sender is not owner", async () => {
      await expect(cLending.connect(alice).changeLoanTerms(10, 120)).to.revertedWith("Ownable: caller is not the owner")
    })

    it("should update loan terms and emit LoanTermsChanged event", async () => {
      const newYearlyPercentInterest = 10
      const newLoanDefaultThresholdPercent = 130
      const tx = await cLending.connect(owner).changeLoanTerms(newYearlyPercentInterest, newLoanDefaultThresholdPercent)
      expect(await cLending.yearlyPercentInterest()).to.be.equal(newYearlyPercentInterest)
      expect(await cLending.loanDefaultThresholdPercent()).to.be.equal(newLoanDefaultThresholdPercent)
      expect(tx).to.emit(cLending, "LoanTermsChanged").withArgs(newYearlyPercentInterest, newLoanDefaultThresholdPercent)
    })
  })

  describe("#editTokenCollaterability function", () => {
    it("revert if msg.sender is not owner", async () => {
      await expect(cLending.connect(alice).editTokenCollaterability(CORE.address, 120)).to.revertedWith("Ownable: caller is not the owner")
    })

    it("should update token collaterability and emit TokenCollaterabilityEdited event", async () => {
      const newCollaterability = 5000
      const tx = await cLending.connect(owner).editTokenCollaterability(CORE.address, newCollaterability)
      expect(await cLending.collaterabilityOfToken(CORE.address)).to.be.equal(newCollaterability)
      expect(tx).to.emit(cLending, "TokenCollaterabilityEdited").withArgs(CORE.address, newCollaterability)
    })
  })

  describe("#addCollateral function", () => {
    const collateral = getBigNumber(20, 18)

    beforeEach(async () => {
      await CORE.connect(alice).approve(cLending.address, collateral)
    })

    it("revert if token is DAI", async () => {
      await expect(cLending.connect(alice).addCollateral(DAI.address, collateral)).to.revertedWith("DAI is not allowed as collateral")
    })

    it("revert if amount is zero", async () => {
      await expect(cLending.connect(alice).addCollateral(CORE.address, 0)).to.revertedWith("Amount is zero")
    })

    it("revert if token is not accepted", async () => {
      const MockTokenFactory = await ethers.getContractFactory("MockToken")
      const mockToken = await MockTokenFactory.connect(alice).deploy()
      await mockToken.connect(alice).approve(cLending.address, collateral)
      await expect(cLending.connect(alice).addCollateral(mockToken.address, collateral)).to.revertedWith("Not accepted as loan collateral")
    })

    it("should let you put in CORE as collateral and get 5500 credit in each", async () => {
      const tx = await cLending.connect(alice).addCollateral(constants.CORE, collateral)

      const currentTime = await latest()
      const userDebtorSummary = await cLending.debtorSummary(await alice.getAddress())
      expect(userDebtorSummary.timeLastBorrow).to.be.equal(currentTime)
      const credit = await cLending.userCollateralValue(await alice.getAddress())

      // Should be coreCollaterability core * collateral * 1e18
      expect(credit).to.equal(coreCollaterability.mul(collateral))

      expect(tx)
        .to.emit(cLending, "CollateralAdded")
        .withArgs(await alice.getAddress(), constants.CORE, collateral, collateral)
    })

    // TODO check revert when accuredInterest
  })

  describe("#borrow function", () => {
    const collateral = getBigNumber(20, 18)

    beforeEach(async () => {
      await CORE.connect(alice).approve(cLending.address, collateral)
      await cLending.connect(alice).addCollateral(constants.CORE, collateral)
    })

    it("revert if amount is zero", async () => {
      await expect(cLending.connect(alice).borrow("0")).to.revertedWith("Amount is zero")
    })

    it("revert if no collateral", async () => {
      const borrowAmount = getBigNumber(5000, 18)
      await expect(cLending.connect(bob).borrow(borrowAmount)).to.revertedWith("Amount is zero")
    })

    it("should borrow DAI and update debt", async () => {
      const borrowAmount = getBigNumber(5000, 18)
      const lendingDaiBalanceBefore = await DAI.balanceOf(cLending.address)
      const tx = await cLending.connect(alice).borrow(borrowAmount)
      const currentTime = await latest()

      expect(await DAI.balanceOf(await alice.getAddress())).to.equal(borrowAmount)
      expect(await DAI.balanceOf(cLending.address)).to.be.equal(lendingDaiBalanceBefore.sub(borrowAmount))
      expect(tx)
        .to.emit(cLending, "Borrowed")
        .withArgs(await alice.getAddress(), borrowAmount)

      const debtorSummary = await cLending.debtorSummary(await alice.getAddress())
      expect(debtorSummary.amountDAIBorrowed).to.be.equal(borrowAmount)
      expect(debtorSummary.timeLastBorrow).to.be.equal(currentTime)
    })

    it("should borrow maximum amount if user want to borrow too much than collateral", async () => {
      const borrowAmount = getBigNumber(500000, 18)
      const borrowMax = collateral.mul(coreCollaterability).mul(BigNumber.from("100")).div(loanDefaultThresholdPercent)
      const lendingDaiBalanceBefore = await DAI.balanceOf(cLending.address)
      const tx = await cLending.connect(alice).borrow(borrowAmount)
      const currentTime = await latest()

      expect(await DAI.balanceOf(await alice.getAddress())).to.equal(borrowMax)
      expect(await DAI.balanceOf(cLending.address)).to.be.equal(lendingDaiBalanceBefore.sub(borrowMax))
      expect(tx)
        .to.emit(cLending, "Borrowed")
        .withArgs(await alice.getAddress(), borrowMax)

      const debtorSummary = await cLending.debtorSummary(await alice.getAddress())
      expect(debtorSummary.amountDAIBorrowed).to.be.equal(borrowMax)
      expect(debtorSummary.timeLastBorrow).to.be.equal(currentTime)
    })
  })

  describe("#repayLoan function", () => {
    const collateral = getBigNumber(20, 18)
    const borrowAmount = getBigNumber(5000, 18)

    beforeEach(async () => {
      await CORE.connect(alice).approve(cLending.address, collateral)
      await cLending.connect(alice).addCollateral(constants.CORE, collateral)
      await cLending.connect(alice).borrow(borrowAmount)
    })

    it("revert if amount is zero", async () => {
      await expect(cLending.connect(alice).borrow("0")).to.revertedWith("Amount is zero")
    })

    it("revert if no collateral", async () => {
      const borrowAmount = getBigNumber(5000, 18)
      await expect(cLending.connect(bob).borrow(borrowAmount)).to.revertedWith("Amount is zero")
    })

    it("should borrow DAI and update debt", async () => {
      const borrowAmount = getBigNumber(5000, 18)
      const lendingDaiBalanceBefore = await DAI.balanceOf(cLending.address)
      const tx = await cLending.connect(alice).borrow(borrowAmount)
      const currentTime = await latest()

      expect(await DAI.balanceOf(await alice.getAddress())).to.equal(borrowAmount)
      expect(await DAI.balanceOf(cLending.address)).to.be.equal(lendingDaiBalanceBefore.sub(borrowAmount))
      expect(tx)
        .to.emit(cLending, "Borrowed")
        .withArgs(await alice.getAddress(), borrowAmount)

      const debtorSummary = await cLending.debtorSummary(await alice.getAddress())
      expect(debtorSummary.amountDAIBorrowed).to.be.equal(borrowAmount)
      expect(debtorSummary.timeLastBorrow).to.be.equal(currentTime)
    })

    it("should borrow maximum amount if user want to borrow too much than collateral", async () => {
      const borrowAmount = getBigNumber(500000, 18)
      const borrowMax = collateral.mul(coreCollaterability).mul(BigNumber.from("100")).div(loanDefaultThresholdPercent)
      const lendingDaiBalanceBefore = await DAI.balanceOf(cLending.address)
      const tx = await cLending.connect(alice).borrow(borrowAmount)
      const currentTime = await latest()

      expect(await DAI.balanceOf(await alice.getAddress())).to.equal(borrowMax)
      expect(await DAI.balanceOf(cLending.address)).to.be.equal(lendingDaiBalanceBefore.sub(borrowMax))
      expect(tx)
        .to.emit(cLending, "Borrowed")
        .withArgs(await alice.getAddress(), borrowMax)

      const debtorSummary = await cLending.debtorSummary(await alice.getAddress())
      expect(debtorSummary.amountDAIBorrowed).to.be.equal(borrowMax)
      expect(debtorSummary.timeLastBorrow).to.be.equal(currentTime)
    })
  })

  it("should correctly add 20% a year interest", async () => {
    // Someone adds collateral and borrows 1000 DAI
    // Then he should have 10%/6months interest so less than 1% monthly from that meaning hsi debt at 110% would be 1100 DAI
  })

  it("should correctly not let people with more than 110% debt do anything except get liquidated", async () => {
    // Someone adds collateral and borrows 1000 DAI
    // Then wait 6months+1 day and it should not let them give it back cause they are in default
  })

  it("should lets people repay and get their debt lower", async () => {
    // Allows people to repay and get their debt lower
  })

  it("should lets people provide too much to repay with any token, and it be calculated correctly based on the token collaterability", async () => {})

  it("should accrue interest correctly goes in DAI(based on collaterability) into the treasury, and is correctly removed from the user re-collaterisation/repayment", async () => {})

  it("should correctly reverts on trying to over borrow", async () => {})

  it("should let users reclaim all the collateral they gave", async () => {})

  it("should correctly doesnt let users reclaim collateral if they have any debt.", async () => {})

  it("The debtTime variable is correctly thought out and updates right in the right places making the user start over in his accural of interest after repayment", async () => {
    // This means after user repays their accrued interest (only can do it whole this is somethign we need to test as well)
  })

  it("Wrapping vouches works correctly and its correctly 1 DAI per voucher in the cLEnding", async () => {
    // correctly working meaning the token is taken out of the users wallet and sent to burn address, and they get the representative amount of coreDAO
    // uint256 public constant DAO_TOKENS_IN_LP1 = 2250;
    // uint256 public constant DAO_TOKENS_IN_LP2 = 9250e14;  <--- this means its cmLP i dont know if this is the right exponent, meanign 1cmLP should be worth 9250
    // uint256 public constant DAO_TOKENS_IN_LP3 = 45; <--- this is in DAI
    // Final numbers should just be lowered to first 5 from whatever decaf calculates for simplicity
  })
})
