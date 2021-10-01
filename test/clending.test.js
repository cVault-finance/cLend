const { expectRevert, time, BN } = require('@openzeppelin/test-helpers');


const CLENDING_ARTIFACT = artifacts.require('CLending');
const CORE_DAO_ARTIFACT = artifacts.require('CoreDAO');

contract('cLending Tests', ([x3, revert, james, joe, john, trashcan]) => {

    beforeEach(async () => {
       
    });

    it("Should not allow contributions when its not started", async () => {
        
        const clend = await CLENDING_ARTIFACT.new();
        const treasury = await DAO_TREASURY_ARTIFACT.new()
        const coreDAO = await CORE_DAO_ARTIFACT.new(tBN18(100000), treasury.address);
        await treasury.initialize(coreDAO.address);

        await clend.initialize(
            treasury.address,
            coreDAO.address,
            20,
            110
        );
        
    })
   

    const tBN18 = (numTokens) => tBN(numTokens,numDecimals)

    const tBN = (numTokens, numDecimals) => new BN(numTokens).mul(new BN(10).pow(new BN(numDecimals)));


});