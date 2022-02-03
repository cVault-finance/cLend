const { expectRevert, time, BN } = require("@openzeppelin/test-helpers");
const { assert, web3, ethers, artifacts } = require("hardhat");
const { impersonate } = require("./utilities/impersonate.js");
const hardhatConfig = require("../hardhat.config");
const {
  advanceTime,
  duration,
  advanceTimeAndBlock,
} = require("./utilities/time");
const { expect } = require("chai");
const ether = require("@openzeppelin/test-helpers/src/ether");

const CLENDING_ARTIFACT = artifacts.require("CLending");
const CORE_DAO_ARTIFACT = artifacts.require("CoreDAO");
const DAO_TREASURY_ARTIFACT = artifacts.require("CoreDAOTreasury");
const TRANSFER_CHECKER_ARTIFACT = artifacts.require("TransferChecker");
const CORE_ARTIFACT = artifacts.require("CORE");
const IERC20 = artifacts.require("IERC20");
const ProxyAdmin = artifacts.require("ProxyAdmin");

contract("cLending Tests", ([x3, revert, james, joe, john, trashcan]) => {
  const CORE_RICH = "0x5A16552f59ea34E44ec81E58b3817833E9fD5436"; // deployer
  const DAI_RICH = "0x5A16552f59ea34E44ec81E58b3817833E9fD5436"; // deployer
  const CORE_DEPLOYER = "0x5A16552f59ea34E44ec81E58b3817833E9fD5436"; // deployer
  const BURN_ADDRESS = "0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF";
  const TREASURY_PROXY_ADDRESS = "0xe508a37101FCe81AB412626eE5F1A648244380de";
  const CLENDING_PROXY_ADDRESS = "0x54B276C8a484eBF2a244D933AF5FFaf595ea58c5";
  const CHUMP_ADDRESS = "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B";
  const PROXY_ADMIN_ADDRESS = "0x9cb1eEcCd165090a4a091209E8c3a353954B1f0f";
  // const CHUMP_ADDRESS = "0x5A16552f59ea34E44ec81E58b3817833E9fD5436";

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
    const TEST_MAINNET = true;

    core = await IERC20.at("0x62359Ed7505Efc61FF1D56fEF82158CcaffA23D7");
    dai = await IERC20.at("0x6b175474e89094c44da98b954eedeac495271d0f");
    await impersonate(CORE_DEPLOYER);

    if (!TEST_MAINNET) {
      clend = await CLENDING_ARTIFACT.new();
      // Deploy it all for tests locally
      treasury = await DAO_TREASURY_ARTIFACT.new();

      const transferChecker = await TRANSFER_CHECKER_ARTIFACT.at(
        await (await CORE_ARTIFACT.at(core.address)).transferCheckerAddress()
      );
      await transferChecker.editNoFeeRecipentList(clend.address, true, {
        from: CORE_RICH,
      });
      await transferChecker.editNoFeeList(clend.address, true, {
        from: CORE_RICH,
      });
    } else {
      // Use mainnet shit
      clend = await CLENDING_ARTIFACT.at(CLENDING_PROXY_ADDRESS);
      proxy_admin = await ProxyAdmin.at(PROXY_ADMIN_ADDRESS);
      let clend_latest_imp = await CLENDING_ARTIFACT.new();
      proxy_admin.upgrade(
        CLENDING_PROXY_ADDRESS,
        clend_latest_imp.address,
        {
          from: CORE_DEPLOYER,
        }
      );
      // Upgrade it
      treasury = await DAO_TREASURY_ARTIFACT.at(TREASURY_PROXY_ADDRESS);
    }

    // coreDAO = await CORE_DAO_ARTIFACT.new(tBN18(100000));
    coreDAO = await CORE_DAO_ARTIFACT.at(
      "0xf66cd2f8755a21d3c8683a10269f795c0532dd58"
    );

    await impersonate("0x5A16552f59ea34E44ec81E58b3817833E9fD5436");
    await treasury.initialize(coreDAO.address, {
      from: "0x5A16552f59ea34E44ec81E58b3817833E9fD5436",
    });

    if (TEST_MAINNET) {
      // let new_clend_imp = await CLENDING_ARTIFACT.new();
      // Send chump 200 CORE and 10k DAI for collateral tests
      await impersonate(CORE_RICH);
      await core.transfer(CHUMP_ADDRESS, tBN18(200), { from: CORE_RICH });
      await dai.transfer(CHUMP_ADDRESS, tBN18(10000), { from: CORE_RICH });

      // Get 0.00011 lp2 in some random chump's wallet
      const LP2_VOUCHER_ADDRESS = "0xb8ee07b5ed2ff9dae6c504c9dee84151f844a591";
      const CORE_VAULT_ADDRESS = "0xc5cacb708425961594b63ec171f4df27a9c0d8c9";
      // core vault has this lp2 at the moment
      let lp2_voucher = await IERC20.at(LP2_VOUCHER_ADDRESS);
      // 0.0001081081081082;
      const lp2_qty_to_wrap = new BN("108108108108109");
      await impersonate(CORE_VAULT_ADDRESS);
      await lp2_voucher.transfer(CHUMP_ADDRESS, lp2_qty_to_wrap, {
        from: CORE_VAULT_ADDRESS,
      });
      let newBal = await lp2_voucher.balanceOf(CHUMP_ADDRESS);

      // Wrap the LP2 giving chump 101,750 coreDAO
      await impersonate(CHUMP_ADDRESS);
      await lp2_voucher.approve(treasury.address, lp2_qty_to_wrap, {
        from: CHUMP_ADDRESS,
      });
      const res = await treasury.wrapVouchers(
        CHUMP_ADDRESS,
        new BN(0),
        lp2_qty_to_wrap,
        new BN(0),
        { from: CHUMP_ADDRESS }
      );
      console.log(
        `coreDAO balance of chump: ${
          (await coreDAO.balanceOf(CHUMP_ADDRESS)) / 1e18
        }`
      );
    } else {
      await treasury.pay(
        coreDAO.address,
        CHUMP_ADDRESS,
        tBN18(100000),
        "benis",
        {
          from: "0x5A16552f59ea34E44ec81E58b3817833E9fD5436",
        }
      ); //send 100k coreDAO to chump for tests purposes
    }

    await clend.initialize(
      treasury.address,
      coreDAO.address,
      yearlyInterest,
      defaultThresholdPercent,
      coreCollaterability,
      {
        from: CORE_DEPLOYER,
      }
    );
    await impersonate(CORE_RICH);

    // fund the contract
    await dai.transfer(clend.address, tBN18(20000000), { from: DAI_RICH });

    await coreDAO.approve(clend.address, "999999999999999999999999999999999", {
      from: CORE_RICH,
    });
    await core.approve(clend.address, "999999999999999999999999999999999", {
      from: CORE_RICH,
    });
    await coreDAO.approve(clend.address, "999999999999999999999999999999999", {
      from: CHUMP_ADDRESS,
    });
    await core.approve(clend.address, "999999999999999999999999999999999", {
      from: CHUMP_ADDRESS,
    });
  }

  beforeEach(async () => {
    await resetFork();
  });

  after(async () => {
    await resetFork();
  });

  it("Should initialize the contracts correctly", async () => {
    await initializeLendingContracts(20, 110, 5500);
    // Check that coreDAO supply is correct
    await assert((await coreDAO.totalSupply()).gt(tBN18(100000)));
    await assert((await coreDAO.totalSupply()).lt(tBN18(100001)));
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
    await clend.addCollateral(core.address, tBN18(2), { from: CHUMP_ADDRESS });
    // add 10,000 DAI in collateral
    await clend.addCollateral(coreDAO.address, tBN18(10000), {
      from: CHUMP_ADDRESS,
    });

    expect(await clend.userCollaterals(CHUMP_ADDRESS)).to.have.lengthOf(2);

    // collateral should be now 5,500 *2 + 10,00 = 21,000
    // cause we initialized core to 5500 above
    const collateral = await clend.userCollateralValue(CHUMP_ADDRESS);
    await assert(collateral.eq(tBN18(21000)));
    await assert((await clend.accruedInterest(CHUMP_ADDRESS)).eq(tBN18(0)));
    await assert((await clend.userTotalDebt(CHUMP_ADDRESS)).eq(tBN18(0)));
  });

  it("Should let user borrow exactly their collateral and not more", async () => {
    await initializeLendingContracts(20, 110, 5500);
    // This should have initiated CORE and COREDAO into the contract

    // add 2 core to collateral
    await clend.addCollateral(core.address, tBN18(2), { from: CHUMP_ADDRESS });
    // add 10,000 DAI in collateral
    await clend.addCollateral(coreDAO.address, tBN18(10000), {
      from: CHUMP_ADDRESS,
    });

    // collateral should be now 5,500 *2 + 10,00 = 21,000
    // cause we initialized core to 5500 above
    const collateral = await clend.userCollateralValue(CHUMP_ADDRESS);
    await assert(collateral.eq(tBN18(21000)));
    await assert((await clend.accruedInterest(CHUMP_ADDRESS)).eq(tBN18(0)));
    await assert((await clend.userTotalDebt(CHUMP_ADDRESS)).eq(tBN18(0)));

    await clend.borrow(tBN18(21000), { from: CHUMP_ADDRESS });
    await expectRevert(
      clend.borrow(tBN18(1), { from: CHUMP_ADDRESS }),
      "OVER_DEBTED"
    );
  });

  it("Should correctly calculate total debt over time", async () => {
    await initializeLendingContracts(20, 110, 5500);
    // This should have initiated CORE and COREDAO into the contract

    // add 2 core to collateral
    await clend.addCollateral(core.address, tBN18(2), { from: CHUMP_ADDRESS });
    // add 10,000 DAI in collateral
    await clend.addCollateral(coreDAO.address, tBN18(10000), {
      from: CHUMP_ADDRESS,
    });

    // collateral should be now 5,500 *2 + 10,00 = 21,000
    // cause we initialized core to 5500 above
    await assert(
      (await clend.userCollateralValue(CHUMP_ADDRESS)).eq(tBN18(21000))
    );
    await assert((await clend.accruedInterest(CHUMP_ADDRESS)).eq(tBN18(0)));
    await assert((await clend.userTotalDebt(CHUMP_ADDRESS)).eq(tBN18(0)));

    await clend.borrow(tBN18(10000), { from: CHUMP_ADDRESS });
    await advanceTimeAndBlock(duration.weeks(26).toNumber()); // half a year
    // we borrowed 10,000 at 20% interst and about half a year so interst should be around 1,000 and total debt around 11,000
    const totalDebtAfterHalfYear = await clend.userTotalDebt(CHUMP_ADDRESS);
    const accuredInterestAfterHalfYear = await clend.accruedInterest(
      CHUMP_ADDRESS
    );

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
        await clend.userTotalDebt(CHUMP_ADDRESS)
      ).eq(
        accuredInterestAfterHalfYear.add(
          (
            await clend.debtorSummary(CHUMP_ADDRESS)
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
      from: CHUMP_ADDRESS,
    });

    await clend.borrow(amountCoreDaoDeposited, { from: CHUMP_ADDRESS });
    await advanceTimeAndBlock(duration.weeks(27).toNumber()); // half a year + 1 week = liquidation
    // we borrowed 10,000 at 20% interst and about half a year so interst should be around 1,000 and total debt around 11,000
    const totalDebt = await clend.userTotalDebt(CHUMP_ADDRESS);
    const accruedInterest = await clend.accruedInterest(CHUMP_ADDRESS);

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

    await clend.liquidateDelinquent(CHUMP_ADDRESS);
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
    await assert((await clend.userCollateralValue(CHUMP_ADDRESS)).eq(tBN18(0)));
    await assert((await clend.accruedInterest(CHUMP_ADDRESS)).eq(tBN18(0)));
    await assert((await clend.userTotalDebt(CHUMP_ADDRESS)).eq(tBN18(0)));
  });

  it("Supply collateral correctly reduces accrued interest to 0 by adding less collateral and repaying with the rest", async () => {
    await initializeLendingContracts(20, 110, 5500);
    // This should have initiated CORE and COREDAO into the contract

    const amountCoreDaoDeposited = tBN18(10000);
    // add 10,000 DAI in collateral
    await clend.addCollateral(coreDAO.address, amountCoreDaoDeposited, {
      from: CHUMP_ADDRESS,
    });

    await clend.borrow(amountCoreDaoDeposited, { from: CHUMP_ADDRESS });
    await advanceTimeAndBlock(duration.weeks(25).toNumber()); // less than half a year
    // Here we should have total debt of about 11k and 1k in interest
    // Add 1 CORE, should get around 4500 additional in credit +/- 5% ( cause we repay 1000ish)
    const balTreasuryBefore = await core.balanceOf(treasury.address);
    const balSenderBefore = await core.balanceOf(CHUMP_ADDRESS);
    const balClendBefore = await core.balanceOf(clend.address);
    await clend.addCollateral(core.address, tBN18(1), { from: CHUMP_ADDRESS });
    const balTreasuryAfter = await core.balanceOf(treasury.address);
    const balSenderAfter = await core.balanceOf(CHUMP_ADDRESS);
    const balClendAfter = await core.balanceOf(clend.address);

    await assert(
      (await clend.userTotalDebt(CHUMP_ADDRESS)).eq(amountCoreDaoDeposited)
    ); // total debt still the same
    await assert((await clend.accruedInterest(CHUMP_ADDRESS)).eq(tBN18(0))); // interst should disappear

    await assert(
      (await clend.userCollateralValue(CHUMP_ADDRESS)).gte(tBN18(14500)) &&
        (await clend.userCollateralValue(CHUMP_ADDRESS)).lt(tBN18(14800))
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

  it("Borrow function should accumulated interests from previous loan in user's pendingInterests so it's not compounded", async () => {
    await initializeLendingContracts(20, 110, 5500);
    // This should have initiated CORE and COREDAO into the contract

    const amountCoreDaoDeposited = tBN18(20000);
    // add 10,000 DAI in collateral
    await clend.addCollateral(coreDAO.address, amountCoreDaoDeposited, {
      from: CHUMP_ADDRESS,
    });

    await clend.borrow(tBN18(10000), { from: CHUMP_ADDRESS });
    await advanceTimeAndBlock(duration.weeks(25).toNumber()); // less than half a year

    // We deposited 20,000 margin and borrowed 10,000
    // And waited about half a year so we should have 1000 in accured interest
    const treasuryDAIBefore = await dai.balanceOf(treasury.address);
    const pendingInterests = await clend.accruedInterest(CHUMP_ADDRESS);
    await clend.borrow(1, { from: CHUMP_ADDRESS });
    const treasuryDAIAfter = await dai.balanceOf(treasury.address);

    await assert(
      (
        await clend.userCollateralValue(CHUMP_ADDRESS)
      ).eq(amountCoreDaoDeposited)
    ); // collateral value should stay the same

    // should have the pending interests
    await assert(
      (await clend.accruedInterest(CHUMP_ADDRESS)).gte(pendingInterests)
    );

    await assert(
      (await clend.userTotalDebt(CHUMP_ADDRESS)).gt(tBN18(10950)) &&
        (await clend.userTotalDebt(CHUMP_ADDRESS)).lt(tBN18(11050))
    ); // total debt should be increased by about 10% from the borrow

    // Treasury should not get anything yet
    const changeInDAIOfTreasury = treasuryDAIAfter.sub(treasuryDAIBefore);
    await assert(changeInDAIOfTreasury.eq(tBN18(0)));
  });

  it("Removing all collateral should work correctly", async () => {
    await initializeLendingContracts(20, 110, 5500);

    await expectRevert(
      clend.reclaimAllCollateral({ from: CHUMP_ADDRESS }),
      "NOTHING_TO_CLAIM"
    );

    // This should have initiated CORE and COREDAO into the contract

    const amountCoreDaoDeposited = tBN18(20000);
    // add 10,000 DAI in collateral
    await clend.addCollateral(coreDAO.address, amountCoreDaoDeposited, {
      from: CHUMP_ADDRESS,
    });

    // We deposited 20,000 margin and borrowed 10,000
    // And waited about half a year so we should have 1000 in accured interest
    const clendCoreDAOBefore = await coreDAO.balanceOf(clend.address);
    const userCoreDAOBefore = await coreDAO.balanceOf(CHUMP_ADDRESS);
    await clend.reclaimAllCollateral({ from: CHUMP_ADDRESS });
    const userCoreDAOAfter = await coreDAO.balanceOf(CHUMP_ADDRESS);
    const clendCoreDAOAfter = await coreDAO.balanceOf(clend.address);

    const collateralValie = await clend.userCollateralValue(CHUMP_ADDRESS);
    // Make sure user has no collateral left
    await assert(collateralValie.isZero());
    await assert((await clend.userTotalDebt(CHUMP_ADDRESS)).isZero());

    // MAke sure it correctly send to the user and not too much
    await assert(
      clendCoreDAOBefore.eq(clendCoreDAOAfter.add(amountCoreDaoDeposited))
    );
    await assert(
      userCoreDAOAfter.eq(userCoreDAOBefore.add(amountCoreDaoDeposited))
    );

    //Re add collateral to make sure users cannot remove collateral if they ahve any debt
    await clend.addCollateral(coreDAO.address, amountCoreDaoDeposited, {
      from: CHUMP_ADDRESS,
    });
    await clend.borrow("10000", { from: CHUMP_ADDRESS });
    await expectRevert(
      clend.reclaimAllCollateral({ from: CHUMP_ADDRESS }),
      "STILL_IN_DEBT"
    );

    // Repay the debt
    await clend.repayLoan(core.address, "100000000", { from: CHUMP_ADDRESS });
    // retry
    await clend.reclaimAllCollateral({ from: CHUMP_ADDRESS });
  });

  it("Massively overpaying debt should take only as much as it needs", async () => {
    await initializeLendingContracts(20, 110, 5500);
    // This should have initiated CORE and COREDAO into the contract

    const daiBalanceBeforeBorrow = await dai.balanceOf(CHUMP_ADDRESS);

    // add 55k worth of core and borrow 55k
    await clend.addCollateralAndBorrow(core.address, tBN18(10), tBN18(55000), {
      from: CHUMP_ADDRESS,
    });

    const daiBalanceAfterBorrow = await dai.balanceOf(CHUMP_ADDRESS);

    await assert(
      daiBalanceAfterBorrow.eq(daiBalanceBeforeBorrow.add(tBN18(55000)))
    );

    const balanceClendBefore = await core.balanceOf(clend.address);
    const balanceUserBefore = await core.balanceOf(CHUMP_ADDRESS);
    // The debt here should be 55k
    // We try to repay with 100
    await clend.repayLoan(core.address, tBN18(100), { from: CHUMP_ADDRESS });
    const balanceClendAfter = await core.balanceOf(clend.address);
    const balanceUserAfter = await core.balanceOf(CHUMP_ADDRESS);

    await assert((await clend.userTotalDebt(CHUMP_ADDRESS)).isZero());

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
      from: CHUMP_ADDRESS,
    });
    await clend.borrow(amountBorrowed, { from: CHUMP_ADDRESS });
    await advanceTimeAndBlock(duration.weeks(25).toNumber()); // less than half a year
    // Here we should have total debt of about 8800 and 800 in interest
    const accuredInterestAfterHalfYear = await clend.accruedInterest(
      CHUMP_ADDRESS
    );
    const existingCollateral = await clend.userCollateralValue(CHUMP_ADDRESS);
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
      from: CHUMP_ADDRESS,
    });

    const finalCollateralValue = await clend.userCollateralValue(CHUMP_ADDRESS);
    console.log(
      "Final Collateral",
      finalCollateralValue.toString() / 1e18,
      "DAI"
    );
    const balTreasuryAfter = await coreDAO.balanceOf(treasury.address);
    console.log("Treasury Balance", balTreasuryAfter.toString() / 1e18);

    //assert(
    //  finalCollateralValue.gt(amountCoreDaoDeposited),
    //  "Collateral should have been added"
    //);
    assert(balTreasuryAfter.gt(0), "Interest should have been paid");
    assert(
      (await clend.accruedInterest(CHUMP_ADDRESS)).isZero(),
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
      from: CHUMP_ADDRESS,
    });
    await clend.borrow(amountBorrowed, { from: CHUMP_ADDRESS });
    await advanceTimeAndBlock(duration.years(1).toNumber()); // Advance a year
    // Here we should have total debt of about 8800 and 800 in interest
    const accuredInterestAfterYear = await clend.accruedInterest(CHUMP_ADDRESS);
    console.log(
      "Accrued interest after a year of borrowing 1k",
      accuredInterestAfterYear.toString() / 1e18,
      "DAI"
    );
    // User borrows another 1k after a year
    await clend.borrow(amountBorrowed, { from: CHUMP_ADDRESS });
    await advanceTimeAndBlock(duration.years(1).toNumber()); // Advance another year
    const accuredInterestAfterTwoYears = await clend.accruedInterest(
      CHUMP_ADDRESS
    );
    console.log(
      "Accrued interest after another year of borrowing 1k",
      accuredInterestAfterTwoYears.toString() / 1e18,
      "DAI"
    );
    const userTotalDebt = await clend.userTotalDebt(CHUMP_ADDRESS);
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
