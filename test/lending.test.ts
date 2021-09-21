import { expect } from "chai"
import { ethers, deployments } from "hardhat"
import { CLending, IERC20 } from "../types"
import { blockNumber, getBigNumber, impersonate } from "./utilities"
import { constants } from "../constants"
import { BigNumber } from "ethers"

let cLending: CLending
let coreDAOTreasury
let yearlyPercentInterest
let loanDefaultThresholdPercent
let coreCollaterability
let coreDaiCollaterability
let CORE: IERC20
let DAI: IERC20

describe("Lending", function () {
  beforeEach(async function () {
    const [deployer, account1] = await ethers.getSigners()
    await deployments.fixture()

    cLending = await ethers.getContract("CLending")
    coreDAOTreasury = await cLending.coreDAOTreasury()
    yearlyPercentInterest = await cLending.yearlyPercentInterest()
    loanDefaultThresholdPercent = await cLending.loanDefaultThresholdPercent()
    coreCollaterability = await cLending.collaterabilityOfToken(constants.CORE)
    coreDaiCollaterability = await cLending.loanDefaultThresholdPercent()

    CORE = await ethers.getContractAt<IERC20>("IERC20", constants.CORE)
    DAI = await ethers.getContractAt<IERC20>("IERC20", constants.DAI)

    // Give some CORE to account1
    await impersonate(constants.CORE_MULTISIG)
    const coreMultiSigSigner = await ethers.getSigner(constants.CORE_MULTISIG)
    await CORE.connect(coreMultiSigSigner).transfer(account1.address, getBigNumber(123))

    // Fund the lending contract with DAI
    await DAI.connect(coreMultiSigSigner).transfer(cLending.address, await DAI.balanceOf(coreMultiSigSigner.address))
  })

  it("should let you put in CORE as collateral and get 5500 credit in each", async () => {
    const [deployer, account1] = await ethers.getSigners()

    const collateral = getBigNumber(20, 18)
    await CORE.connect(account1).approve(cLending.address, collateral)
    await cLending.connect(account1).addCollateral(constants.CORE, collateral)

    const credit = await cLending.userCollateralValue(account1.address)

    // Should be coreCollaterability core * collateral * 1e18
    expect(credit).to.equal(coreCollaterability.mul(collateral))
  })

  it("should let the guy borrow DAI for the amount", async () => {
    const [deployer, account1] = await ethers.getSigners()
    const collateral = getBigNumber(20, 18)
    await CORE.connect(account1).approve(cLending.address, collateral)
    await cLending.connect(account1).addCollateral(constants.CORE, collateral)

    const credit = await cLending.userCollateralValue(account1.address)

    // Should be coreCollaterability core * collateral * 1e18
    expect(credit).to.equal(coreCollaterability.mul(collateral))
    await cLending.connect(account1).borrow(credit)
    expect(await DAI.balanceOf(account1.address)).to.equal(credit)
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
