import { expect } from "chai"
import { ethers, deployments } from "hardhat"
import { CLending, IERC20 } from "../types"
import { getBigNumber, getRandomAddress, impersonate, latest, increase } from "./utilities"
import { constants } from "../constants"
import { BigNumber, Signer, utils, constants as EtherConstants } from "ethers"

const DEPLOYER = "0x5A16552f59ea34E44ec81E58b3817833E9fD5436"

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
  const ONE_YEAR = getBigNumber(365 * 3600 * 24, 0)

  beforeEach(async function () {
    const accounts = await ethers.getSigners()
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

    await impersonate(DEPLOYER)
    owner = await ethers.getSigner(DEPLOYER)
  })

  describe("#receive function", () => {
    it("revert if ether sent to cLend", async () => {
      await expect(
        alice.sendTransaction({
          to: cLending.address,
          value: utils.parseEther("1"),
        })
      ).to.revertedWith("ETH_NOT_ACCEPTED")
    })
  })

  describe("#changeLoanTerms function", () => {
    it("revert if msg.sender is not owner", async () => {
      await expect(cLending.connect(alice).changeLoanTerms(10, 120)).to.revertedWith("Ownable: caller is not the owner")
    })

    it("revert if loanDefaultThresholdPercent is less than or equal to 100", async () => {
      await expect(cLending.connect(owner).changeLoanTerms(10, 100)).to.revertedWith("WOULD_LIQUIDATE")
    })

    it("should update loan terms and emit LoanTermsChanged event", async () => {
      const newYearlyPercentInterest = 10
      const newLoanDefaultThresholdPercent = 130
      const tx = await cLending.connect(owner).changeLoanTerms(newYearlyPercentInterest, newLoanDefaultThresholdPercent)
      const currentTime = await latest()

      expect(await cLending.yearlyPercentInterest()).to.be.equal(newYearlyPercentInterest)
      expect(await cLending.loanDefaultThresholdPercent()).to.be.equal(newLoanDefaultThresholdPercent)

      expect(tx)
        .to.emit(cLending, "LoanTermsChanged")
        .withArgs(
          yearlyPercentInterest,
          newYearlyPercentInterest,
          loanDefaultThresholdPercent,
          newLoanDefaultThresholdPercent,
          currentTime,
          await owner.getAddress()
        )
    })
  })

  describe("#editTokenCollaterability function", () => {
    it("revert if msg.sender is not owner", async () => {
      await expect(cLending.connect(alice).editTokenCollaterability(CORE.address, 120)).to.revertedWith("Ownable: caller is not the owner")
    })

    it("revert if token was not added", async () => {
      await expect(cLending.connect(owner).editTokenCollaterability(getRandomAddress(), 120)).to.revertedWith("NOT_ADDED")
    })

    it("should update token collaterability and emit TokenCollaterabilityChanged event", async () => {
      const newCollaterability = 5000
      const tx = await cLending.connect(owner).editTokenCollaterability(CORE.address, newCollaterability)
      const currentTime = await latest()
      expect(await cLending.collaterabilityOfToken(CORE.address)).to.be.equal(newCollaterability)
      expect(await cLending.tokenRetired(CORE.address)).to.be.equal(false)

      expect(tx)
        .to.emit(cLending, "TokenCollaterabilityChanged")
        .withArgs(CORE.address, coreCollaterability, newCollaterability, currentTime, await owner.getAddress())
    })

    it("should update tokenRetired if new collaterability is zero", async () => {
      const newCollaterability = 0
      await cLending.connect(owner).editTokenCollaterability(CORE.address, newCollaterability)

      // TODO does not update collaterability
      // expect(await cLending.collaterabilityOfToken(CORE.address)).to.be.equal(newCollaterability)
      expect(await cLending.tokenRetired(CORE.address)).to.be.equal(true)
    })
  })

  describe("#addNewToken function", () => {
    const newToken = getRandomAddress()
    const liquidationBeneficiary = getRandomAddress()
    const collaterabilityInDAI = 6000
    const decimals = 18

    it("revert if msg.sender is not owner", async () => {
      await expect(cLending.connect(alice).addNewToken(newToken, liquidationBeneficiary, collaterabilityInDAI, decimals)).to.revertedWith(
        "Ownable: caller is not the owner"
      )
    })

    it("revert if decimals is not 18", async () => {
      await expect(cLending.connect(owner).addNewToken(newToken, liquidationBeneficiary, collaterabilityInDAI, 17)).to.revertedWith(
        "UNSUPPORTED_DECIMALS"
      )
    })

    it("revert if token already added", async () => {
      await expect(cLending.connect(owner).addNewToken(CORE.address, liquidationBeneficiary, collaterabilityInDAI, decimals)).to.revertedWith(
        "ALREADY_ADDED"
      )
    })

    it("revert if collaterabilityInDAI is zero", async () => {
      await expect(cLending.connect(owner).addNewToken(newToken, liquidationBeneficiary, 0, decimals)).to.revertedWith("INVALID_COLLATERABILITY")
    })

    it("should add new token and emit NewTokenAdded event", async () => {
      const tx = await cLending.connect(owner).addNewToken(newToken, liquidationBeneficiary, collaterabilityInDAI, decimals)
      const currentTime = await latest()
      expect(await cLending.liquidationBeneficiaryOfToken(newToken)).to.be.equal(liquidationBeneficiary)
      expect(await cLending.collaterabilityOfToken(newToken)).to.be.equal(collaterabilityInDAI)

      expect(tx)
        .to.emit(cLending, "NewTokenAdded")
        .withArgs(newToken, collaterabilityInDAI, liquidationBeneficiary, currentTime, await owner.getAddress())
    })

    it("should set dead address when liquidationBeneficiary is zero address", async () => {
      const tx = await cLending.connect(owner).addNewToken(newToken, EtherConstants.AddressZero, collaterabilityInDAI, decimals)
      const currentTime = await latest()
      expect(await cLending.liquidationBeneficiaryOfToken(newToken)).to.be.equal(constants.DEAD_BEEF)
      expect(await cLending.collaterabilityOfToken(newToken)).to.be.equal(collaterabilityInDAI)

      expect(tx)
        .to.emit(cLending, "NewTokenAdded")
        .withArgs(newToken, collaterabilityInDAI, constants.DEAD_BEEF, currentTime, await owner.getAddress())
    })
  })

  describe("#editTokenLiquiationBeneficiary function", () => {
    const token = getRandomAddress()
    const liquidationBeneficiary = getRandomAddress()
    const newLiquidationBeneficiary = getRandomAddress()
    const collaterabilityInDAI = 6000
    const decimals = 18

    beforeEach(async () => {
      await cLending.connect(owner).addNewToken(token, liquidationBeneficiary, collaterabilityInDAI, decimals)
    })

    it("revert if msg.sender is not owner", async () => {
      await expect(cLending.connect(alice).editTokenLiquidationBeneficiary(token, newLiquidationBeneficiary)).to.revertedWith(
        "Ownable: caller is not the owner"
      )
    })

    it("revert if token is CORE or CoreDAO", async () => {
      await expect(cLending.connect(owner).editTokenLiquidationBeneficiary(CORE.address, newLiquidationBeneficiary)).to.revertedWith(
        "CANNOT_MODIFY"
      )

      await expect(cLending.connect(owner).editTokenLiquidationBeneficiary(await cLending.coreDAO(), newLiquidationBeneficiary)).to.revertedWith(
        "CANNOT_MODIFY"
      )
    })

    it("should edit tokenLiquiationBeneficiary and emit TokenLiquidationBeneficiaryChanged event", async () => {
      const tx = await cLending.connect(owner).editTokenLiquidationBeneficiary(token, newLiquidationBeneficiary)
      const currentTime = await latest()
      expect(await cLending.liquidationBeneficiaryOfToken(token)).to.be.equal(newLiquidationBeneficiary)

      expect(tx)
        .to.emit(cLending, "TokenLiquidationBeneficiaryChanged")
        .withArgs(token, liquidationBeneficiary, newLiquidationBeneficiary, currentTime, await owner.getAddress())
    })

    it("should set dead address when liquidationBeneficiary is zero address", async () => {
      const tx = await cLending.connect(owner).editTokenLiquidationBeneficiary(token, EtherConstants.AddressZero)
      const currentTime = await latest()
      expect(await cLending.liquidationBeneficiaryOfToken(token)).to.be.equal(constants.DEAD_BEEF)

      expect(tx)
        .to.emit(cLending, "TokenLiquidationBeneficiaryChanged")
        .withArgs(token, liquidationBeneficiary, constants.DEAD_BEEF, currentTime, await owner.getAddress())
    })
  })

  describe("#addCollateral function", () => {
    const collateral = getBigNumber(20, 18)

    beforeEach(async () => {
      await CORE.connect(alice).approve(cLending.address, collateral)
    })

    it("revert if token is DAI", async () => {
      await expect(cLending.connect(alice).addCollateral(DAI.address, collateral)).to.revertedWith("DAI_IS_ONLY_FOR_REPAYMENT")
    })

    it("revert if token retired", async () => {
      await cLending.connect(owner).editTokenCollaterability(CORE.address, 0)
      await expect(cLending.connect(alice).addCollateral(CORE.address, collateral)).to.revertedWith("TOKEN_RETIRED")
    })

    it("revert if token is not accepted", async () => {
      const MockTokenFactory = await ethers.getContractFactory("MockToken")
      const mockToken = await MockTokenFactory.connect(alice).deploy()
      await mockToken.connect(alice).approve(cLending.address, collateral)
      await expect(cLending.connect(alice).addCollateral(mockToken.address, collateral)).to.revertedWith("NOT_ACCEPTED")
    })

    it("revert if amount is zero", async () => {
      await expect(cLending.connect(alice).addCollateral(CORE.address, 0)).to.revertedWith("INVALID_AMOUNT")
    })

    it("should let you put in CORE as collateral and get credit in each", async () => {
      const tx = await cLending.connect(alice).addCollateral(constants.CORE, collateral)

      const currentTime = await latest()
      const userDebtorSummary = await cLending.debtorSummary(await alice.getAddress())
      expect(userDebtorSummary.timeLastBorrow.toString()).to.be.equal("0")
      const credit = await cLending.userCollateralValue(await alice.getAddress())

      // Should be coreCollaterability core * collateral * 1e18
      expect(credit).to.equal(coreCollaterability.mul(collateral))

      expect(tx)
        .to.emit(cLending, "CollateralAdded")
        .withArgs(constants.CORE, collateral, currentTime, await alice.getAddress())
    })

    it("should not revert if amount is less than accrued interest", async () => {
      const borrowAmount = collateral.mul(coreCollaterability).div(BigNumber.from(2))
      await cLending.connect(alice).addCollateralAndBorrow(constants.CORE, collateral, borrowAmount)
      const timePeriod = getBigNumber(3600 * 24 * 7, 0)

      await increase(timePeriod)
      const interest = borrowAmount.mul(yearlyPercentInterest).mul(timePeriod).div(ONE_YEAR).div(getBigNumber(100, 0))

      await CORE.connect(alice).approve(cLending.address, interest.div(coreCollaterability))
      await expect(cLending.connect(alice).addCollateral(constants.CORE, interest.div(coreCollaterability))).to.not.revertedWith(
        "INSUFFICIENT_AMOUNT"
      )
    })
  })

  describe("#borrow function", () => {
    const collateral = getBigNumber(20, 18)

    beforeEach(async () => {
      await CORE.connect(alice).approve(cLending.address, collateral)
      await cLending.connect(alice).addCollateral(constants.CORE, collateral)
    })

    it("revert if amount is zero", async () => {
      await expect(cLending.connect(alice).borrow("0")).to.revertedWith("NO_BORROW")
    })

    it("revert if over debted", async () => {
      const borrowAmount = collateral.mul(coreCollaterability)
      await cLending.connect(alice).borrow(borrowAmount)
      const timePeriod = getBigNumber(3600 * 24 * 7, 0)

      await increase(timePeriod)

      await expect(cLending.connect(alice).borrow(borrowAmount)).to.revertedWith("OVER_DEBTED")
    })

    it("revert if no collateral", async () => {
      // TODO did not check when borrow amount is zero
      // const borrowAmount = getBigNumber(5000, 18)
      // await expect(cLending.connect(bob).borrow(borrowAmount)).to.revertedWith("Amount is zero")
    })

    it("should borrow DAI and update debt", async () => {
      const borrowAmount = getBigNumber(5000, 18)
      const lendingDaiBalanceBefore = await DAI.balanceOf(cLending.address)
      const tx = await cLending.connect(alice).borrow(borrowAmount)
      const currentTime = await latest()

      expect(await DAI.balanceOf(await alice.getAddress())).to.equal(borrowAmount)
      expect(await DAI.balanceOf(cLending.address)).to.be.equal(lendingDaiBalanceBefore.sub(borrowAmount))
      expect(tx)
        .to.emit(cLending, "LoanTaken")
        .withArgs(borrowAmount, currentTime, await alice.getAddress())

      const debtorSummary = await cLending.debtorSummary(await alice.getAddress())
      expect(debtorSummary.amountDAIBorrowed).to.be.equal(borrowAmount)
      expect(debtorSummary.timeLastBorrow).to.be.equal(currentTime)
    })

    it("should borrow maximum amount if user want to borrow too much than collateral", async () => {
      const borrowAmount = getBigNumber(500000, 18)
      const borrowMax = collateral.mul(coreCollaterability)
      const lendingDaiBalanceBefore = await DAI.balanceOf(cLending.address)
      const tx = await cLending.connect(alice).borrow(borrowAmount)
      const currentTime = await latest()

      expect(await DAI.balanceOf(await alice.getAddress())).to.equal(borrowMax)
      expect(await DAI.balanceOf(cLending.address)).to.be.equal(lendingDaiBalanceBefore.sub(borrowMax))
      expect(tx)
        .to.emit(cLending, "LoanTaken")
        .withArgs(borrowMax, currentTime, await alice.getAddress())

      const debtorSummary = await cLending.debtorSummary(await alice.getAddress())
      expect(debtorSummary.amountDAIBorrowed).to.be.equal(borrowMax)
      expect(debtorSummary.timeLastBorrow).to.be.equal(currentTime)
    })

    it("should increase DAI borrowed with interest", async () => {
      const borrowAmount1 = getBigNumber(3000, 18)
      await cLending.connect(alice).borrow(borrowAmount1)

      const firstDepositTime = await latest()
      const timePeriod = getBigNumber(3600 * 24 * 7, 0)

      await increase(timePeriod)

      const borrowAmount2 = getBigNumber(5000, 18)
      const lendingDaiBalanceBefore = await DAI.balanceOf(cLending.address)
      const aliceDaiBalanceBefore = await DAI.balanceOf(await alice.getAddress())
      const tx = await cLending.connect(alice).borrow(borrowAmount2)
      const currentTime = await latest()

      const interest = borrowAmount1.mul(yearlyPercentInterest).mul(currentTime.sub(firstDepositTime)).div(ONE_YEAR).div(getBigNumber(100, 0))

      expect(await DAI.balanceOf(await alice.getAddress())).to.equal(aliceDaiBalanceBefore.add(borrowAmount2))
      expect(await DAI.balanceOf(cLending.address)).to.be.equal(lendingDaiBalanceBefore.sub(borrowAmount2))
      expect(tx)
        .to.emit(cLending, "LoanTaken")
        .withArgs(borrowAmount2, currentTime, await alice.getAddress())

      expect(tx)
        .to.not.emit(cLending, "InterestPaid")
        .withArgs(constants.DAI, interest, currentTime, await alice.getAddress())

      const debtorSummary = await cLending.debtorSummary(await alice.getAddress())
      expect(debtorSummary.amountDAIBorrowed).to.be.equal(borrowAmount1.add(borrowAmount2))
      expect(debtorSummary.timeLastBorrow).to.be.equal(currentTime)
    })
  })

  describe("#repayLoan function", () => {
    const collateral = getBigNumber(20, 18)
    const borrowAmount = getBigNumber(5000, 18)
    const repayAmount = getBigNumber(10, 18)
    let firstDepositTime: BigNumber
    const timePeriod = getBigNumber(3600 * 24 * 7, 0)

    beforeEach(async () => {
      await CORE.connect(alice).approve(cLending.address, collateral.mul(BigNumber.from("100")))
      await cLending.connect(alice).addCollateralAndBorrow(constants.CORE, collateral, borrowAmount)
      firstDepositTime = await latest()
      await increase(timePeriod)
    })

    it("revert if no debt", async () => {
      await expect(cLending.connect(bob).repayLoan(CORE.address, repayAmount)).to.revertedWith("NOT_DEBT")
    })

    it("revert if amount is zero", async () => {
      await expect(cLending.connect(alice).repayLoan(CORE.address, "0")).to.revertedWith("NOT_ENOUGH_COLLATERAL_OFFERED")
    })

    it("revert if token is retired", async () => {
      await cLending.connect(owner).editTokenCollaterability(CORE.address, 0)
      await expect(cLending.connect(alice).repayLoan(CORE.address, repayAmount)).to.revertedWith("TOKEN_RETIRED")
    })

    it("revert if repay amount is less than interest", async () => {
      const currentTime = await latest()

      const interest = borrowAmount.mul(yearlyPercentInterest).mul(currentTime.sub(firstDepositTime)).div(ONE_YEAR).div(getBigNumber(100, 0))
      await expect(cLending.connect(alice).repayLoan(CORE.address, interest.div(coreCollaterability).sub(BigNumber.from("1")))).to.revertedWith(
        "INSUFFICIENT_AMOUNT"
      )
    })

    it("should repay all debt", async () => {
      let currentTime = await latest()

      const interestEstimate = borrowAmount
        .mul(yearlyPercentInterest)
        .mul(currentTime.sub(firstDepositTime))
        .div(ONE_YEAR)
        .div(getBigNumber(100, 0))

      const debtEstimate = borrowAmount.add(interestEstimate)

      const treasuryCoreBalanceBefore = await CORE.balanceOf(coreDAOTreasury)
      const lendingCoreBalanceBefore = await CORE.balanceOf(cLending.address)
      const aliceCoreBalanceBefore = await CORE.balanceOf(await alice.getAddress())

      const tx = await cLending.connect(alice).repayLoan(CORE.address, debtEstimate.add(BigNumber.from("1000")))
      currentTime = await latest()
      const interest = borrowAmount.mul(yearlyPercentInterest).mul(currentTime.sub(firstDepositTime)).div(ONE_YEAR).div(getBigNumber(100, 0))

      const debt = borrowAmount.add(interest)

      expect(tx)
        .to.emit(cLending, "Repayment")
        .withArgs(CORE.address, debt.div(coreCollaterability), currentTime, await alice.getAddress())
      expect(tx)
        .to.emit(cLending, "InterestPaid")
        .withArgs(CORE.address, interest, currentTime, await alice.getAddress())
      expect(await CORE.balanceOf(await alice.getAddress())).to.be.equal(aliceCoreBalanceBefore.sub(debt.div(coreCollaterability)))
      // TODO check later
      // expect(await CORE.balanceOf(coreDAOTreasury)).to.be.equal(treasuryCoreBalanceBefore.add(interest.div(coreCollaterability)))
      expect(await CORE.balanceOf(cLending.address)).to.be.equal(
        lendingCoreBalanceBefore.add(debt.div(coreCollaterability).sub(interest.div(coreCollaterability)))
      )

      const debtorSummary = await cLending.debtorSummary(await alice.getAddress())
      expect(debtorSummary.amountDAIBorrowed).to.be.equal(0)
    })

    it("should repay some of debt", async () => {
      let currentTime = await latest()

      const interestEstimate = borrowAmount
        .mul(yearlyPercentInterest)
        .mul(currentTime.sub(firstDepositTime))
        .div(ONE_YEAR)
        .div(getBigNumber(100, 0))

      const debtEstimate = borrowAmount.add(interestEstimate)
      const repayAmount = interestEstimate.add(borrowAmount.div(BigNumber.from(2))).div(coreCollaterability)

      const treasuryCoreBalanceBefore = await CORE.balanceOf(coreDAOTreasury)
      const lendingCoreBalanceBefore = await CORE.balanceOf(cLending.address)
      const aliceCoreBalanceBefore = await CORE.balanceOf(await alice.getAddress())

      const tx = await cLending.connect(alice).repayLoan(CORE.address, repayAmount)
      currentTime = await latest()
      const interest = borrowAmount.mul(yearlyPercentInterest).mul(currentTime.sub(firstDepositTime)).div(ONE_YEAR).div(getBigNumber(100, 0))

      const debt = borrowAmount.add(interest)

      expect(tx)
        .to.emit(cLending, "Repayment")
        .withArgs(CORE.address, repayAmount, currentTime, await alice.getAddress())
      expect(tx)
        .to.emit(cLending, "InterestPaid")
        .withArgs(CORE.address, interest, currentTime, await alice.getAddress())
      expect(await CORE.balanceOf(await alice.getAddress())).to.be.equal(aliceCoreBalanceBefore.sub(repayAmount))
      // TODO check later
      // expect(await CORE.balanceOf(coreDAOTreasury)).to.be.equal(treasuryCoreBalanceBefore.add(interest.div(coreCollaterability)))
      expect(await CORE.balanceOf(cLending.address)).to.be.equal(
        lendingCoreBalanceBefore.add(repayAmount.sub(interest.div(coreCollaterability)))
      )

      const debtorSummary = await cLending.debtorSummary(await alice.getAddress())
      expect(debtorSummary.amountDAIBorrowed).to.be.equal(debt.sub(repayAmount.mul(coreCollaterability)))
    })
  })

  describe("#liquidateDelinquent function", () => {
    const collateral = getBigNumber(20, 18)
    let borrowAmount: BigNumber

    beforeEach(async () => {
      borrowAmount = collateral.mul(coreCollaterability)
      await CORE.connect(alice).approve(cLending.address, collateral.mul(BigNumber.from("100")))
      await cLending.connect(alice).addCollateralAndBorrow(constants.CORE, collateral, borrowAmount)
    })

    it("should liquidate delinquent", async () => {
      await increase(ONE_YEAR)
      const burnBalanceBefore = await CORE.balanceOf(constants.DEAD_BEEF)
      const tx = await cLending.connect(alice).liquidateDelinquent(await alice.getAddress())
      const currentTime = await latest()
      expect(tx)
        .to.emit(cLending, "Liquidation")
        .withArgs(await alice.getAddress(), collateral.mul(coreCollaterability), currentTime, await alice.getAddress())

      // TODO check later
      // expect(await CORE.balanceOf(constants.DEAD_BEEF)).to.equal(burnBalanceBefore.add(collateral))

      const debtorSummary = await cLending.debtorSummary(await alice.getAddress())
      expect(debtorSummary.amountDAIBorrowed).to.be.equal(0)
      expect(debtorSummary.timeLastBorrow).to.be.equal(0)
    })
  })

  describe("#reclaimAllCollateral function", () => {
    const collateral = getBigNumber(20, 18)

    beforeEach(async () => {
      await CORE.connect(alice).approve(cLending.address, collateral)
      await cLending.connect(alice).addCollateral(constants.CORE, collateral)
    })

    it("revert if debt is not zero", async () => {
      await cLending.connect(alice).borrow("1000")
      await expect(cLending.connect(alice).reclaimAllCollateral()).to.revertedWith("STILL_IN_DEBT")
    })

    it("revert if no collateral", async () => {
      await expect(cLending.connect(bob).reclaimAllCollateral()).to.revertedWith("NOTHING_TO_CLAIM")
    })

    it("should reclaim collateral and emit CollateralReclaimed event per token", async () => {
      const aliceBalanceBefore = await CORE.balanceOf(await alice.getAddress())
      const lendingBalanceBefore = await CORE.balanceOf(cLending.address)

      const tx = await cLending.connect(alice).reclaimAllCollateral()
      const currentTime = await latest()

      expect(await CORE.balanceOf(cLending.address)).to.equal(lendingBalanceBefore.sub(collateral))
      // TODO check later
      // expect(await CORE.balanceOf(await alice.getAddress())).to.equal(aliceBalanceBefore.add(collateral))
      expect(tx)
        .to.emit(cLending, "CollateralReclaimed")
        .withArgs(CORE.address, collateral, currentTime, await alice.getAddress())
    })
  })
})
