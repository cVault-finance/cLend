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
const ProxyAdmin = artifacts.require("MockProxyAdmin");

contract("cLending Tests", ([x3, revert, james, joe, john, trashcan]) => {
  const CORE_RICH = "0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF"; // core burn address
  const DAI_RICH = "0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7"; // dai curve pool
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
    const currentBlockNumber = await getBlockNumber();
    console.log(`currentBlockNumber: ${currentBlockNumber}`);

    core = await IERC20.at("0x62359Ed7505Efc61FF1D56fEF82158CcaffA23D7");
    dai = await IERC20.at("0x6b175474e89094c44da98b954eedeac495271d0f");
    await impersonate(CORE_DEPLOYER);
    let POST_LIVE = true;
    if(POST_LIVE) {
      coreDAO = await CORE_DAO_ARTIFACT.at(
        "0xf66cd2f8755a21d3c8683a10269f795c0532dd58"
      );
      clend = await CLENDING_ARTIFACT.at(CLENDING_PROXY_ADDRESS);
      proxy_admin = await ProxyAdmin.at(PROXY_ADMIN_ADDRESS);
      treasury = await DAO_TREASURY_ARTIFACT.at(TREASURY_PROXY_ADDRESS);
      await impersonate(CORE_RICH);
      await core.transfer(CHUMP_ADDRESS, tBN18(200), { from: CORE_RICH });
      await impersonate(DAI_RICH);
      await dai.transfer(CHUMP_ADDRESS, tBN18(10000), { from: DAI_RICH });
      await impersonate(CHUMP_ADDRESS);
      await impersonate(CLENDING_PROXY_ADDRESS);
      await coreDAO.transfer(CHUMP_ADDRESS, tBN18(20000), {
        from: CLENDING_PROXY_ADDRESS,
      });
      await coreDAO.approve(
        clend.address,
        "999999999999999999999999999999999",
        {
          from: CORE_RICH,
        }
      );
      await core.approve(
        clend.address,
        "999999999999999999999999999999999",
        {
          from: CORE_RICH,
        }
      );
      await coreDAO.approve(
        clend.address,
        "999999999999999999999999999999999",
        {
          from: CHUMP_ADDRESS,
        }
      );
      await core.approve(
        clend.address,
        "999999999999999999999999999999999",
        {
          from: CHUMP_ADDRESS,
        }
      );
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
      return;
    }

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
      proxy_admin.upgrade(CLENDING_PROXY_ADDRESS, clend_latest_imp.address, {
        from: CORE_DEPLOYER,
      });
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
      await impersonate(DAI_RICH);
      await core.transfer(CHUMP_ADDRESS, tBN18(200), { from: CORE_RICH });
      await dai.transfer(CHUMP_ADDRESS, tBN18(10000), { from: DAI_RICH });

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

  it("Should give a percentage to the caller when someone is liquidated", async () => {
    await initializeLendingContracts(20, 110, 5500);
    let liquidator_before_coredao_bal = await coreDAO.balanceOf(CHUMP_ADDRESS);
    let liquidator_before_core_bal = await core.balanceOf(CHUMP_ADDRESS);
    VICTIM = "0x9Cf94236e4845cCd6Eb5bf99b40d4129FEEc3f03";
    let tx = await clend.liquidateDelinquent(VICTIM, { from: CHUMP_ADDRESS });
    console.log(tx);
    console.log(tx.receipt.logs);
    assert(
      liquidator_before_coredao_bal.eq(await coreDAO.balanceOf(CHUMP_ADDRESS)),
      "coredao balance changed"
    );
    assert(
      liquidator_before_core_bal.eq(await core.balanceOf(CHUMP_ADDRESS)),
      "core balance changed"
    );
    /*
    This was done on mainnet in block 15307968 and it worked as expected with a collateral of coreDAO
    https://etherscan.io/tx/0xeeea936c4adf57f7c34f0b9910ffb51e739cdcfd93023011b7d46c3436c2df22
    */
  })

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
