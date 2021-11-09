const { expectRevert, time, BN } = require("@openzeppelin/test-helpers");
const { assert, web3 } = require("hardhat");
const { impersonate } = require("./utilities/impersonate.js");
const hardhatConfig = require("../hardhat.config");
const {
  advanceTime,
  duration,
  advanceTimeAndBlock,
} = require("./utilities/time");
const { expect } = require("chai");

const CLENDING_ARTIFACT = artifacts.require("CLending");
const CORE_DAO_ARTIFACT = artifacts.require("CoreDAO");
const DAO_TREASURY_ARTIFACT = artifacts.require("CoreDAOTreasury");
const TRANSFER_CHECKER_ARTIFACT = artifacts.require("TransferChecker");
const CORE_ARTIFACT = artifacts.require("CORE");

contract("cLending Tests", ([x3, revert, james, joe, john, trashcan]) => {
  const CORE_RICH = "0x5A16552f59ea34E44ec81E58b3817833E9fD5436"; // deployer
  const DAI_RICH = "0x5A16552f59ea34E44ec81E58b3817833E9fD5436"; // deployer
  const BURN_ADDRESS = "0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF";

  let clend;
  let treasury;
  let coreDAO;
  let core;
  let dai;

  async function initializeLendingContracts(
    yearlyInterest = 20,
    defaultThresholdPercent = 110,
    coreCollaterability = 5500
  ) {
    clend = await CLENDING_ARTIFACT.new();
    treasury = await DAO_TREASURY_ARTIFACT.new();
    coreDAO = await CORE_DAO_ARTIFACT.new(tBN18(100000), treasury.address);
    await treasury.initialize(coreDAO.address);

    await clend.initialize(
      treasury.address,
      coreDAO.address,
      yearlyInterest,
      defaultThresholdPercent,
      coreCollaterability
    );
    await impersonate(CORE_RICH);

    core = await CORE_DAO_ARTIFACT.at(
      "0x62359Ed7505Efc61FF1D56fEF82158CcaffA23D7"
    ); // not the actual artifact but has all the functions we need
    dai = await CORE_DAO_ARTIFACT.at(
      "0x6b175474e89094c44da98b954eedeac495271d0f"
    );

    // fund the contract
    await dai.transfer(clend.address, tBN18(20000000), { from: DAI_RICH });
    await treasury.pay(
      coreDAO.address,
      "0x5A16552f59ea34E44ec81E58b3817833E9fD5436",
      tBN18(100000),
      "benis"
    ); //send 100k coreDAO to deployer for tests purposes

    await coreDAO.approve(clend.address, "999999999999999999999999999999999", {
      from: CORE_RICH,
    });
    await core.approve(clend.address, "999999999999999999999999999999999", {
      from: CORE_RICH,
    });

    const transferChecker = await TRANSFER_CHECKER_ARTIFACT.at(
      await (await CORE_ARTIFACT.at(core.address)).transferCheckerAddress()
    );

    // TODO important have to set lists for core txfee
    await transferChecker.editNoFeeRecipentList(clend.address, true, {
      from: CORE_RICH,
    });
    await transferChecker.editNoFeeList(clend.address, true, {
      from: CORE_RICH,
    });
  }

  beforeEach(async () => {
    await resetFork();
  });

  it("Should initialize the contracts correctly", async () => {
    await initializeLendingContracts(20, 110, 5500);
    // Check that coreDAO supply is correct
    await assert((await coreDAO.totalSupply()).eq(tBN18(100000)));
    // Check that addresses are set correctly in cLend
    await assert((await clend.coreDAO()) == coreDAO.address);
    await assert((await clend.coreDAOTreasury()) == treasury.address);

    // Check that the values are set correctly in cLend
    await assert((await clend.yearlyPercentInterest()).toString() == "20");
    await assert(
      (await clend.loanDefaultThresholdPercent()).toString() == "110"
    );
    await assert(
      (
        await clend.collaterabilityOfToken(
          "0x62359Ed7505Efc61FF1D56fEF82158CcaffA23D7"
        )
      ).toString() == "5500"
    ); //  core collaterability
  });

  it("Should let user deposit various assets and correctly calculate their collateral", async () => {
    await initializeLendingContracts(20, 110, 5500);
    // This should have initiated CORE and COREDAO into the contract

    // add 2 core to collateral
    await clend.addCollateral(core.address, tBN18(2), { from: CORE_RICH });
    // add 10,000 DAI in collateral
    await clend.addCollateral(coreDAO.address, tBN18(10000), {
      from: CORE_RICH,
    });

    expect(await clend.userCollaterals(CORE_RICH)).to.have.lengthOf(2);

    // collateral should be now 5,500 *2 + 10,00 = 21,000
    // cause we initialized core to 5500 above
    const collateral = await clend.userCollateralValue(CORE_RICH);
    await assert(collateral.eq(tBN18(21000)));
    await assert((await clend.accruedInterest(CORE_RICH)).eq(tBN18(0)));
    await assert((await clend.userTotalDebt(CORE_RICH)).eq(tBN18(0)));
  });

  it("Should let user borrow exactly their collateral and not more", async () => {
    await initializeLendingContracts(20, 110, 5500);
    // This should have initiated CORE and COREDAO into the contract

    // add 2 core to collateral
    await clend.addCollateral(core.address, tBN18(2), { from: CORE_RICH });
    // add 10,000 DAI in collateral
    await clend.addCollateral(coreDAO.address, tBN18(10000), {
      from: CORE_RICH,
    });

    // collateral should be now 5,500 *2 + 10,00 = 21,000
    // cause we initialized core to 5500 above
    const collateral = await clend.userCollateralValue(CORE_RICH);
    await assert(collateral.eq(tBN18(21000)));
    await assert((await clend.accruedInterest(CORE_RICH)).eq(tBN18(0)));
    await assert((await clend.userTotalDebt(CORE_RICH)).eq(tBN18(0)));

    await clend.borrow(tBN18(21000), { from: CORE_RICH });
    await expectRevert(
      clend.borrow(tBN18(1), { from: CORE_RICH }),
      "OVER_DEBTED"
    );
  });

  it("Should correctly calculate total debt over time", async () => {
    await initializeLendingContracts(20, 110, 5500);
    // This should have initiated CORE and COREDAO into the contract

    // add 2 core to collateral
    await clend.addCollateral(core.address, tBN18(2), { from: CORE_RICH });
    // add 10,000 DAI in collateral
    await clend.addCollateral(coreDAO.address, tBN18(10000), {
      from: CORE_RICH,
    });

    // collateral should be now 5,500 *2 + 10,00 = 21,000
    // cause we initialized core to 5500 above
    await assert((await clend.userCollateralValue(CORE_RICH)).eq(tBN18(21000)));
    await assert((await clend.accruedInterest(CORE_RICH)).eq(tBN18(0)));
    await assert((await clend.userTotalDebt(CORE_RICH)).eq(tBN18(0)));

    await clend.borrow(tBN18(10000), { from: CORE_RICH });
    await advanceTimeAndBlock(duration.weeks(26).toNumber()); // half a year
    // we borrowed 10,000 at 20% interst and about half a year so interst should be around 1,000 and total debt around 11,000
    const totalDebtAfterHalfYear = await clend.userTotalDebt(CORE_RICH);
    const accuredInterestAfterHalfYear = await clend.accruedInterest(CORE_RICH);

    console.log(
      "Debt after half a year or borrowign 10k",
      totalDebtAfterHalfYear.toString() / 1e18,
      "DAI"
    );
    console.log(
      "Accrued interest after half a year of borrowning 10k",
      accuredInterestAfterHalfYear.toString() / 1e18,
      "DAI"
    );

    // Check the total debt is interst + amount borrowed
    await assert(
      (
        await clend.userTotalDebt(CORE_RICH)
      ).eq(
        accuredInterestAfterHalfYear.add(
          (
            await clend.debtorSummary(CORE_RICH)
          ).amountDAIBorrowed
        )
      )
    );

    // Make sure its within 5% of our expectation here whichi is expectation 10% increase
    await assert(
      totalDebtAfterHalfYear.gt(tBN18(10950)) &&
        totalDebtAfterHalfYear.lt(tBN18(11050))
    );

    await assert(
      accuredInterestAfterHalfYear.gt(tBN18(950)) &&
        accuredInterestAfterHalfYear.lt(tBN18(1050))
    );
  });

  it("Correctly liquidates at 110% of collateral", async () => {
    await initializeLendingContracts(20, 110, 5500);
    // This should have initiated CORE and COREDAO into the contract

    const amountCoreDaoDeposited = tBN18(10000);
    // add 10,000 DAI in collateral
    await clend.addCollateral(coreDAO.address, amountCoreDaoDeposited, {
      from: CORE_RICH,
    });

    await clend.borrow(amountCoreDaoDeposited, { from: CORE_RICH });
    await advanceTimeAndBlock(duration.weeks(27).toNumber()); // half a year + 1 week = liquidation
    // we borrowed 10,000 at 20% interst and about half a year so interst should be around 1,000 and total debt around 11,000
    const totalDebt = await clend.userTotalDebt(CORE_RICH);
    const accruedInterest = await clend.accruedInterest(CORE_RICH);

    // Make sure its within 5% of our expectation here whichi is expectation 10% increase
    await assert(
      totalDebt.gt(amountCoreDaoDeposited.mul(new BN(11)).div(new BN(10))) //greater than 110%
    );

    await assert(
      accruedInterest.gt(tBN18(1000).div(new BN(10))) //greater than 10%
    );

    // User should be liquidatable
    const balCoreDaoBurnAddressBefore = await coreDAO.balanceOf(BURN_ADDRESS);
    const balCoreDaoClendBefore = await coreDAO.balanceOf(clend.address);

    await clend.liquidateDelinquent(CORE_RICH);
    const balCoreDaoBurnAddressAfter = await coreDAO.balanceOf(BURN_ADDRESS);
    const balCoreDaoClendAfter = await coreDAO.balanceOf(clend.address);

    // We check balances of burn address and clend to make sure the liquidation is removing the exact amount it should
    await assert(
      balCoreDaoBurnAddressAfter.eq(
        balCoreDaoBurnAddressBefore.add(amountCoreDaoDeposited)
      )
    );

    await assert(
      balCoreDaoClendAfter.eq(balCoreDaoClendBefore.sub(amountCoreDaoDeposited))
    );

    // We make sure the struct has been deleted correctly
    await assert((await clend.userCollateralValue(CORE_RICH)).eq(tBN18(0)));
    await assert((await clend.accruedInterest(CORE_RICH)).eq(tBN18(0)));
    await assert((await clend.userTotalDebt(CORE_RICH)).eq(tBN18(0)));
  });

  it("Supply collateral correctly reduces accrued interest to 0 by adding less collateral and repaying with the rest", async () => {
    await initializeLendingContracts(20, 110, 5500);
    // This should have initiated CORE and COREDAO into the contract

    const amountCoreDaoDeposited = tBN18(10000);
    // add 10,000 DAI in collateral
    await clend.addCollateral(coreDAO.address, amountCoreDaoDeposited, {
      from: CORE_RICH,
    });

    await clend.borrow(amountCoreDaoDeposited, { from: CORE_RICH });
    await advanceTimeAndBlock(duration.weeks(25).toNumber()); // less than half a year
    // Here we should have total debt of about 11k and 1k in interest
    // Add 1 CORE, should get around 4500 additional in credit +/- 5% ( cause we repay 1000ish)
    const balTreasuryBefore = await core.balanceOf(treasury.address);
    const balSenderBefore = await core.balanceOf(CORE_RICH);
    const balClendBefore = await core.balanceOf(clend.address);
    await clend.addCollateral(core.address, tBN18(1), { from: CORE_RICH });
    const balTreasuryAfter = await core.balanceOf(treasury.address);
    const balSenderAfter = await core.balanceOf(CORE_RICH);
    const balClendAfter = await core.balanceOf(clend.address);

    await assert(
      (await clend.userTotalDebt(CORE_RICH)).eq(amountCoreDaoDeposited)
    ); // total debt still the same
    await assert((await clend.accruedInterest(CORE_RICH)).eq(tBN18(0))); // interst should disappear

    console.log((await clend.userCollateralValue(CORE_RICH)).toString());
    await assert(
      (await clend.userCollateralValue(CORE_RICH)).gte(tBN18(14500)) &&
        (await clend.userCollateralValue(CORE_RICH)).lt(tBN18(14800))
    ); // 10k + 5500-1000 so minimum 14500

    const deltaBalanceTreasury = balTreasuryAfter.sub(balTreasuryBefore);

    // accrued interest should get sent to treasury
    await assert(balTreasuryAfter.gt(balTreasuryBefore));
    // 1000 / 5500 = amount total it should sent at most but not less than 900/5500
    const max = tBN18(1)
      .mul(new BN(100000).div(new BN(5500)))
      .div(new BN(100)); //1000/5500 in e2 and then div it out
    const min = tBN18(1)
      .mul(new BN(90000).div(new BN(5500)))
      .div(new BN(100));
    await assert(deltaBalanceTreasury.lt(max));
    await assert(deltaBalanceTreasury.gt(min));

    await assert(balSenderAfter.eq(balSenderBefore.sub(tBN18(1))));
    await assert(
      balClendAfter.eq(balClendBefore.add(tBN18(1)).sub(deltaBalanceTreasury))
    );
  });

  it("Repayment of accured interest should be taken out of outstanding debt when using the borrow function", async () => {
    await initializeLendingContracts(20, 110, 5500);
    // This should have initiated CORE and COREDAO into the contract

    const amountCoreDaoDeposited = tBN18(20000);
    // add 10,000 DAI in collateral
    await clend.addCollateral(coreDAO.address, amountCoreDaoDeposited, {
      from: CORE_RICH,
    });

    await clend.borrow(tBN18(10000), { from: CORE_RICH });
    await advanceTimeAndBlock(duration.weeks(25).toNumber()); // less than half a year

    // We deposited 20,000 margin and borrowed 10,000
    // And waited about half a year so we should have 1000 in accured interest
    const treasuryDAIBefore = await dai.balanceOf(treasury.address);
    await clend.borrow(1, { from: CORE_RICH });
    const treasuryDAIAfter = await dai.balanceOf(treasury.address);

    await assert(
      (await clend.userCollateralValue(CORE_RICH)).eq(amountCoreDaoDeposited)
    ); // collateral value should stay the same
    await assert((await clend.accruedInterest(CORE_RICH)).eq(tBN18(0))); // interst should be paid off
    await assert(
      (await clend.userTotalDebt(CORE_RICH)).gt(tBN18(10950)) &&
        (await clend.userTotalDebt(CORE_RICH)).lt(tBN18(11050))
    ); // total debt should be increased by about 10% from the borrow

    // Treasury should get around 1000 more dai
    const changeInDAIOfTreasury = treasuryDAIAfter.sub(treasuryDAIBefore);
    await assert(
      changeInDAIOfTreasury.gt(tBN18(950)) &&
        changeInDAIOfTreasury.lt(tBN18(1050))
    ); // total debt should be increased by about 10% from the borrow
  });

  it("Removing all collateral should work correctly", async () => {
    await initializeLendingContracts(20, 110, 5500);

    await expectRevert(
      clend.reclaimAllCollateral({ from: CORE_RICH }),
      "NOTHING_TO_CLAIM"
    );

    // This should have initiated CORE and COREDAO into the contract

    const amountCoreDaoDeposited = tBN18(20000);
    // add 10,000 DAI in collateral
    await clend.addCollateral(coreDAO.address, amountCoreDaoDeposited, {
      from: CORE_RICH,
    });

    // We deposited 20,000 margin and borrowed 10,000
    // And waited about half a year so we should have 1000 in accured interest
    const clendCoreDAOBefore = await coreDAO.balanceOf(clend.address);
    const userCoreDAOBefore = await coreDAO.balanceOf(CORE_RICH);
    await clend.reclaimAllCollateral({ from: CORE_RICH });
    const userCoreDAOAfter = await coreDAO.balanceOf(CORE_RICH);
    const clendCoreDAOAfter = await coreDAO.balanceOf(clend.address);

    const collateralValue = await clend.userCollateralValue(CORE_RICH);
    // Make sure user has no collateral left
    await assert(collateralValue.isZero());
    await assert((await clend.userTotalDebt(CORE_RICH)).isZero());

    // MAke sure it correctly send to the user and not too much
    await assert(
      clendCoreDAOBefore.eq(clendCoreDAOAfter.add(amountCoreDaoDeposited))
    );
    await assert(
      userCoreDAOAfter.eq(userCoreDAOBefore.add(amountCoreDaoDeposited))
    );

    //Re add collateral to make sure users cannot remove collateral if they ahve any debt
    await clend.addCollateral(coreDAO.address, amountCoreDaoDeposited, {
      from: CORE_RICH,
    });
    await clend.borrow("10000", { from: CORE_RICH });
    await expectRevert(
      clend.reclaimAllCollateral({ from: CORE_RICH }),
      "STILL_IN_DEBT"
    );

    // Repay the debt
    await clend.repayLoan(core.address, "100000000", { from: CORE_RICH });
    // retry
    await clend.reclaimAllCollateral({ from: CORE_RICH });
  });

  it("Massively overpaying debt should take only as much as it needs", async () => {
    await initializeLendingContracts(20, 110, 5500);
    // This should have initiated CORE and COREDAO into the contract

    // add 55k worth of core and borrow 55k
    await clend.addCollateralAndBorrow(core.address, tBN18(10), tBN18(55000), {
      from: CORE_RICH,
    });

    const balanceClendBefore = await core.balanceOf(clend.address);
    const balanceUserBefore = await core.balanceOf(CORE_RICH);
    // The debt here should be 55k
    // We try to repay with 100
    await clend.repayLoan(core.address, tBN18(100), { from: CORE_RICH });
    const balanceClendAfter = await core.balanceOf(clend.address);
    const balanceUserAfter = await core.balanceOf(CORE_RICH);

    await assert((await clend.userTotalDebt(CORE_RICH)).isZero());

    // We make sure we removed more or equal to 10 tokens but less than 11
    await assert(
      balanceUserAfter.lte(balanceUserBefore.sub(tBN18(10))) &&
        balanceUserAfter.gte(balanceUserBefore.sub(tBN18(11)))
    );

    // We make sure that balance of cLend is exactly 10 tokens richer cause it sent rest to accured interest if there is any acc interest
    await assert(balanceClendAfter.eq(balanceClendBefore.add(tBN18(10))));
  });

  it("Paying interest from addCollateral should be from existing Collateral", async () => {
    await initializeLendingContracts(20, 110, 5500);
    // This should have initiated CORE and COREDAO into the contract

    const amountCoreDaoDeposited = tBN18(10000);
    const amountBorrowed = tBN18(8000);
    // add 10,000 DAI in collateral & borrow 8,000 DAI
    await clend.addCollateral(coreDAO.address, amountCoreDaoDeposited, {
      from: CORE_RICH,
    });
    await clend.borrow(amountBorrowed, { from: CORE_RICH });
    await advanceTimeAndBlock(duration.weeks(25).toNumber()); // less than half a year
    // Here we should have total debt of about 8800 and 800 in interest
    const accuredInterestAfterHalfYear = await clend.accruedInterest(CORE_RICH);
    const existingCollateral = await clend.userCollateralValue(CORE_RICH);
    console.log(
      "Existing Collateral",
      existingCollateral.toString() / 1e18,
      "DAI"
    );
    console.log(
      "Accrued interest after half a year of borrowing 8k",
      accuredInterestAfterHalfYear.toString() / 1e18,
      "DAI"
    );
    const userTotalDebt1 = await clend.userTotalDebt(CORE_RICH);
    console.log("User total debt", userTotalDebt1.toString() / 1e18, "DAI");

    const amountCoreDaoAdded = tBN18(500);
    // add 500 DAI in collateral
    // We need the added collateral amount to be less than the interest
    assert(
      amountCoreDaoAdded.lt(accuredInterestAfterHalfYear) &&
        existingCollateral.gte(accuredInterestAfterHalfYear),
      "Added Collateral should be less than the interest amount"
    );

    // adding the Collateral should not revert and use existing Collateral
    await clend.addCollateral(coreDAO.address, amountCoreDaoAdded, {
      from: CORE_RICH,
    });

    const finalCollateralValue = await clend.userCollateralValue(CORE_RICH);
    console.log(
      "Final Collateral",
      finalCollateralValue.toString() / 1e18,
      "DAI"
    );
    const balTreasuryAfter = await coreDAO.balanceOf(treasury.address);
    const userTotalDebt = await clend.userTotalDebt(CORE_RICH);
    console.log(
      "User total debt After paying Interests",
      userTotalDebt.toString() / 1e18,
      "DAI"
    );
    console.log("Treasury Balance", balTreasuryAfter.toString() / 1e18);

    assert(
      finalCollateralValue.gt(tBN18(9730)) &&
        finalCollateralValue.lt(tBN18(9735)),
      "Collateral should have been added"
    );
    assert(balTreasuryAfter.gt(0), "Interest should have been paid");
    assert(
      (await clend.accruedInterest(CORE_RICH)).isZero(),
      "User's Interest not set to 0"
    );
  });

  it("Interest should be calculated on the real borrowed amount", async () => {
    await initializeLendingContracts(20, 110, 5500);
    // This should have initiated CORE and COREDAO into the contract

    const amountCoreDaoDeposited = tBN18(10000);
    const amountBorrowed = tBN18(1000);
    // add 10,000 DAI in collateral & borrow 1,000 DAI
    await clend.addCollateral(coreDAO.address, amountCoreDaoDeposited, {
      from: CORE_RICH,
    });
    await clend.borrow(amountBorrowed, { from: CORE_RICH });
    await advanceTimeAndBlock(duration.years(1).toNumber()); // Advance a year

    const accruedInterestAfterYear = await clend.accruedInterest(CORE_RICH);
    console.log(
      "Accrued interest after a year of borrowing 1k",
      accruedInterestAfterYear.toString() / 1e18,
      "DAI"
    );
    // User borrows another 1k after a year
    await clend.borrow(amountBorrowed, { from: CORE_RICH });
    await advanceTimeAndBlock(duration.years(1).toNumber()); // Advance another year
    const accuredInterestAfterTwoYears = await clend.accruedInterest(CORE_RICH);
    console.log(
      "Accrued interest after another year of borrowing 2k",
      accuredInterestAfterTwoYears.toString() / 1e18,
      "DAI"
    );
    const userTotalDebt = await clend.userTotalDebt(CORE_RICH);
    console.log(
      "User total debt after 2 years",
      userTotalDebt.toString() / 1e18,
      "DAI"
    );
    // User total debt should be ~ 2600
    assert(
      userTotalDebt.gt(tBN18(2595)) && userTotalDebt.lt(tBN18(2605)),
      "User total debt should be around 2600"
    );
  });

  const tBN18 = (numTokens) => tBN(numTokens, 18);

  const tBN = (numTokens, numDecimals) =>
    new BN(numTokens).mul(new BN(10).pow(new BN(numDecimals)));
});

const resetFork = async (blockNumber) => {
  blockNumber =
    blockNumber || hardhatConfig.default.networks.hardhat.forking.blockNumber;
  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: hardhatConfig.default.networks.hardhat.forking.url,
          blockNumber,
        },
      },
    ],
  });

  const currentBlockNumber = await getBlockNumber();
  if (currentBlockNumber !== blockNumber) {
    throw new Error(
      `Failed to changed block number to ${blockNumber}, currently at ${currentBlockNumber}`
    );
  }
};
const getBlockNumber = async () => {
  const { result } = await send("eth_blockNumber");
  return parseInt(result, 16);
};
const send = (method, params = []) =>
  new Promise((resolve, reject) => {
    web3.currentProvider.send(
      { jsonrpc: "2.0", id: Date.now(), method, params },
      (err, res) => (err ? reject(err) : resolve(res))
    );
  });
