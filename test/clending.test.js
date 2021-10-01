const { expectRevert, time, BN } = require('@openzeppelin/test-helpers');
const { assert,web3 } = require('hardhat');
const { impersonate} = require('./utilities/impersonate.js');
const hardhatConfig = require('../hardhat.config');
const {advanceTime,duration,advanceTimeAndBlock}= require('./utilities/time');

const CLENDING_ARTIFACT = artifacts.require('CLending');
const CORE_DAO_ARTIFACT = artifacts.require('CoreDAO');
const DAO_TREASURY_ARTIFACT = artifacts.require('CoreDAOTreasury');

contract('cLending Tests', ([x3, revert, james, joe, john, trashcan]) => {

    const CORE_RICH = "0x5A16552f59ea34E44ec81E58b3817833E9fD5436" // deployer
    const DAI_RICH = "0x5A16552f59ea34E44ec81E58b3817833E9fD5436" // deployer
    const BURN_ADDRESS = "0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF"

    let clend;
    let treasury;
    let coreDAO;
    let core;
    let dai;

    async function initializeLendingContracts (yearlyInterest = 20, defaultThresholdPercent = 110, coreCollaterability = 5500) {
        clend = await CLENDING_ARTIFACT.new();
        treasury = await DAO_TREASURY_ARTIFACT.new()
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

        core = await CORE_DAO_ARTIFACT.at("0x62359Ed7505Efc61FF1D56fEF82158CcaffA23D7"); // not the actual artifact but has all the functions we need
        dai = await CORE_DAO_ARTIFACT.at("0x6b175474e89094c44da98b954eedeac495271d0f");

        // fund the contract
        await dai.transfer(clend.address, tBN18(20000000),{from :DAI_RICH})
        await treasury.pay(coreDAO.address, "0x5A16552f59ea34E44ec81E58b3817833E9fD5436", tBN18(100000), "benis"); //send 100k coreDAO to deployer for tests purposes

        await coreDAO.approve(clend.address, "999999999999999999999999999999999",{from :CORE_RICH})
        await core.approve(clend.address, "999999999999999999999999999999999",{from :CORE_RICH})

    }


    beforeEach(async () => {
        await resetFork();

    });


    it("Should initialize the contracts correctly", async () => {
        await initializeLendingContracts(20,110,5500);
        // Check that coreDAO supply is correct
        await assert((await coreDAO.totalSupply()).eq(tBN18(100000)))
        // Check that addresses are set correctly in cLend
        await assert((await clend.coreDAO()) == coreDAO.address)
        await assert((await clend.coreDAOTreasury()) == treasury.address)

        // Check that the values are set correctly in cLend
        await assert((await clend.yearlyPercentInterest()).toString()  == "20")
        await assert((await clend.loanDefaultThresholdPercent()).toString() == "110")
        await assert((await clend.collaterabilityOfToken("0x62359Ed7505Efc61FF1D56fEF82158CcaffA23D7")).toString() == "5500") //  core collaterability
    });

    it("Should let user deposit various assets and correctly calculate their collateral", async () => {
        await initializeLendingContracts(20,110,5500);
        // This should have initiated CORE and COREDAO into the contract
        
        // add 2 core to collateral
        await clend.addCollateral(core.address, tBN18(2),{from :CORE_RICH});
        // add 10,000 DAI in collateral
        await clend.addCollateral(coreDAO.address, tBN18(10000),{from :CORE_RICH});

        // collateral should be now 5,500 *2 + 10,00 = 21,000
        // cause we initialized core to 5500 above
        const collateral = await clend.userCollateralValue(CORE_RICH)
        await assert((collateral).eq(tBN18(21000)))
        await assert((await clend.accruedInterest(CORE_RICH)).eq(tBN18(0)))
        await assert((await clend.userTotalDebt(CORE_RICH)).eq(tBN18(0)))
    });

    it("Should let user borrow exactly their collateral and not more", async () => {
        await initializeLendingContracts(20,110,5500);
        // This should have initiated CORE and COREDAO into the contract
        
        // add 2 core to collateral
        await clend.addCollateral(core.address, tBN18(2),{from :CORE_RICH});
        // add 10,000 DAI in collateral
        await clend.addCollateral(coreDAO.address, tBN18(10000),{from :CORE_RICH});

        // collateral should be now 5,500 *2 + 10,00 = 21,000
        // cause we initialized core to 5500 above
        const collateral = await clend.userCollateralValue(CORE_RICH)
        await assert((collateral).eq(tBN18(21000)))
        await assert((await clend.accruedInterest(CORE_RICH)).eq(tBN18(0)));
        await assert((await clend.userTotalDebt(CORE_RICH)).eq(tBN18(0)));

        await clend.borrow(tBN18(21000),{from:CORE_RICH});
        await expectRevert( clend.borrow(tBN18(1),{from:CORE_RICH}), "CLending: OVER_DEBTED");
    });

    it("Should correctly calculate total debt over time", async () => {
        await initializeLendingContracts(20,110,5500);
        // This should have initiated CORE and COREDAO into the contract
        
        // add 2 core to collateral
        await clend.addCollateral(core.address, tBN18(2),{from :CORE_RICH});
        // add 10,000 DAI in collateral
        await clend.addCollateral(coreDAO.address, tBN18(10000),{from :CORE_RICH});

        // collateral should be now 5,500 *2 + 10,00 = 21,000
        // cause we initialized core to 5500 above
        await assert((await clend.userCollateralValue(CORE_RICH)).eq(tBN18(21000)))
        await assert((await clend.accruedInterest(CORE_RICH)).eq(tBN18(0)));
        await assert((await clend.userTotalDebt(CORE_RICH)).eq(tBN18(0)));

        await clend.borrow(tBN18(10000),{from:CORE_RICH});
        await advanceTimeAndBlock(duration.weeks(26).toNumber()) // half a year
        // we borrowed 10,000 at 20% interst and about half a year so interst should be around 1,000 and total debt around 11,000
        const totalDebtAfterHalfYear = await clend.userTotalDebt(CORE_RICH);
        const accuredInterestAfterHalfYear =await clend.accruedInterest(CORE_RICH);

        console.log("Debt after half a year or borrowign 10k",totalDebtAfterHalfYear.toString() /1e18, "DAI");
        console.log("Accrued interest after half a year of borrowning 10k",accuredInterestAfterHalfYear.toString() /1e18, "DAI");

        // Check the total debt is interst + amount borrowed
        await assert((await clend.userTotalDebt(CORE_RICH)).eq( accuredInterestAfterHalfYear.add( (await clend.debtorSummary(CORE_RICH)).amountDAIBorrowed )  ));

        // Make sure its within 5% of our expectation here whichi is expectation 10% increase
        await assert(
            totalDebtAfterHalfYear
            .gt(tBN18(10950)) &&
            totalDebtAfterHalfYear
            .lt(tBN18(11050))
        );

        await assert(
            accuredInterestAfterHalfYear
            .gt(tBN18(950)) &&
            accuredInterestAfterHalfYear
            .lt(tBN18(1050))
        )

    });

    it("Correctly liquidates at 110% of collateral", async () => {
        await initializeLendingContracts(20,110,5500);
        // This should have initiated CORE and COREDAO into the contract
        
        const amountCoreDaoDeposited = tBN18(10000);
        // add 10,000 DAI in collateral
        await clend.addCollateral(coreDAO.address, amountCoreDaoDeposited ,{from :CORE_RICH});


        await clend.borrow(amountCoreDaoDeposited,{from:CORE_RICH});
        await advanceTimeAndBlock(duration.weeks(27).toNumber()) // half a year + 1 week = liquidation
        // we borrowed 10,000 at 20% interst and about half a year so interst should be around 1,000 and total debt around 11,000
        const totalDebt = await clend.userTotalDebt(CORE_RICH);
        const accruedInterest =await clend.accruedInterest(CORE_RICH);

        // Make sure its within 5% of our expectation here whichi is expectation 10% increase
        await assert(
            totalDebt
            .gt(amountCoreDaoDeposited.mul(new BN(11)).div(new BN(10))) //greater than 110%
           
        );

        await assert(
            accruedInterest
            .gt(tBN18(1000).div(new BN(10))) //greater than 10%
        )

        // User should be liquidatable
        const balCoreDaoBurnAddressBefore = await coreDAO.balanceOf(BURN_ADDRESS)
        const balCoreDaoClendBefore = await coreDAO.balanceOf(clend.address)

        await clend.liquidateDelinquent(CORE_RICH);
        const balCoreDaoBurnAddressAfter = await coreDAO.balanceOf(BURN_ADDRESS)
        const balCoreDaoClendAfter = await coreDAO.balanceOf(clend.address);
        
        // We check balances of burn address and clend to make sure the liquidation is removing the exact amount it should
        await assert(
            balCoreDaoBurnAddressAfter.eq( balCoreDaoBurnAddressBefore.add(amountCoreDaoDeposited)  )
        )

        await assert(
            balCoreDaoClendAfter.eq( balCoreDaoClendBefore.sub(amountCoreDaoDeposited)  )
        )
        
        // We make sure the struct has been deleted correctly
        await assert((await clend.userCollateralValue(CORE_RICH)).eq(tBN18(0)))
        await assert((await clend.accruedInterest(CORE_RICH)).eq(tBN18(0)));
        await assert((await clend.userTotalDebt(CORE_RICH)).eq(tBN18(0)));
    });





    const tBN18 = (numTokens) => tBN(numTokens,18)

    const tBN = (numTokens, numDecimals) => new BN(numTokens).mul(new BN(10).pow(new BN(numDecimals)));


});

const resetFork = async (blockNumber) => {
  blockNumber =  blockNumber || hardhatConfig.default.networks.hardhat.forking.blockNumber;
  await network.provider.request({
    method: "hardhat_reset",
    params: [{
      forking: {
        jsonRpcUrl: hardhatConfig.default.networks.hardhat.forking.url,
        blockNumber,
      }
    }]
  });

  const currentBlockNumber = await getBlockNumber();
  if (currentBlockNumber !== blockNumber) {
      throw new Error(`Failed to changed block number to ${blockNumber}, currently at ${currentBlockNumber}`);
  }
};
const getBlockNumber = async () => {
  const { result } = await send('eth_blockNumber');
  return parseInt(result, 16);
};
const send = (method, params = []) => new Promise((resolve, reject) => {
  web3.currentProvider.send(
    { jsonrpc: '2.0', id: Date.now(), method, params },
    (err, res) => err ? reject(err) : resolve(res),
  );
});