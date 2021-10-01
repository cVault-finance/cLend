const { expectRevert, time, BN } = require('@openzeppelin/test-helpers');
const { assert } = require('hardhat');
const { impersonate} = require('./utilities/impersonate.js');


const CLENDING_ARTIFACT = artifacts.require('CLending');
const CORE_DAO_ARTIFACT = artifacts.require('CoreDAO');
const DAO_TREASURY_ARTIFACT = artifacts.require('CoreDAOTreasury');

contract('cLending Tests', ([x3, revert, james, joe, john, trashcan]) => {

    const CORE_RICH = "0x5A16552f59ea34E44ec81E58b3817833E9fD5436" // deployer
    const DAI_RICH = "0x5A16552f59ea34E44ec81E58b3817833E9fD5436" // deployer


    let clend;
    let treasury;
    let coreDAO;
    let core;

    async function initializeLendingContracts (yearlyInterest = 20, defaultThresholdPercent = 110, coreCollaterability = 5500) {
        clend = await CLENDING_ARTIFACT.new();
        treasury = await DAO_TREASURY_ARTIFACT.new()
        coreDAO = await CORE_DAO_ARTIFACT.new(tBN18(100000), treasury.address);
        await treasury.initialize(coreDAO.address);

        await clend.initialize(
            treasury.address,
            coreDAO.address,
            20,
            110,
            5500
        );

        core = await CORE_DAO_ARTIFACT.at("0x62359Ed7505Efc61FF1D56fEF82158CcaffA23D7"); // not the actual artifact but has all the functions we need

        await treasury.pay(coreDAO.address, "0x5A16552f59ea34E44ec81E58b3817833E9fD5436", tBN18(100000), "benis"); //send 100k coreDAO to deployer for tests purposes
    }


    beforeEach(async () => {
       await impersonate(CORE_RICH)
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
        
        await coreDAO.approve(clend.address, "999999999999999999999999999999999",{from :CORE_RICH})
        await core.approve(clend.address, "999999999999999999999999999999999",{from :CORE_RICH})

        // add 2 core to collateral
        await clend.addCollateral(core.address, tBN18(2),{from :CORE_RICH});
        // add 10,000 DAI in collateral
        await clend.addCollateral(coreDAO.address, tBN18(10000),{from :CORE_RICH});

        // collateral should be now 5,500 *2 + 10,00 = 21,000
        // cause we initialized core to 5500 above
        const collateral = await clend.userCollateralValue(CORE_RICH)
        console.log(collateral.toString())
        await assert((collateral).eq(tBN18(21000)),"")
    });


    const tBN18 = (numTokens) => tBN(numTokens,18)

    const tBN = (numTokens, numDecimals) => new BN(numTokens).mul(new BN(10).pow(new BN(numDecimals)));


});