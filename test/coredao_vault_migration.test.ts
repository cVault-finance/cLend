import { expect } from "chai"
import { Signer, utils } from "ethers"
import hre, { ethers, deployments, network } from "hardhat"
import { CoreDAO, CoreDAOTreasury, CoreVaultV3, IERC20, MockProxyAdmin } from "../types"
import { impersonate } from "../test/utilities"

const DEPLOYER = "0x5A16552f59ea34E44ec81E58b3817833E9fD5436"
const VAULT = "0xC5cacb708425961594B63eC171f4df27a9c0d8c9"

// user with vouchers in the 3 pools
const user = "0x1cb3fae03e5f73df7cbbc75e1d236dc459c72436"

describe("migrations / coredao vault migration", async () => {
  let snapshot
  let deployerSigner
  let Vault: CoreVaultV3
  let CoreDAO: IERC20
  let Core: IERC20
  let CoreVault: CoreVaultV3

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: "https://eth-mainnet.alchemyapi.io/v2/TsLEJAhX87icgMO7ZVyPcpeEgpFEo96O",
            blockNumber: 13919761,
          },
        },
      ],
    })

    await deployments.fixture()
    await impersonate(DEPLOYER)
    await impersonate(user)

    deployerSigner = await ethers.getSigner(DEPLOYER)
    Vault = await ethers.getContractAt<CoreVaultV3>("CoreVaultV3", VAULT)
    Core = await ethers.getContractAt<IERC20>("IERC20", "0x62359ed7505efc61ff1d56fef82158ccaffa23d7")
    CoreDAO = await ethers.getContract("CoreDAO")
    snapshot = await ethers.provider.send("evm_snapshot", [])
  })

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshot])
    snapshot = await ethers.provider.send("evm_snapshot", [])
  })

  it("should fail to migrate as the coredao pool does not exist", async () => {
    await expect(Vault.migrateVouchers()).to.be.revertedWith("WRONG_POOL_COUNT")
  })

  it("should fail to migrate as the coredao is using the wrong token", async () => {
    await Vault.connect(deployerSigner).add(100, "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", true, true)
    await expect(Vault.migrateVouchers()).to.be.revertedWith("WRONG_TOKEN")
  })

  it("should fail to migrate as there is nothing to migrate", async () => {
    const account = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
    await impersonate(account)
    const signer = await ethers.getSigner(account)
    await Vault.connect(deployerSigner).add(100, CoreDAO.address, true, true)
    await impersonate("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2")
    await expect(Vault.connect(signer).migrateVouchers()).to.be.revertedWith("NOTHING_TO_WRAP")
  })

  it("should migrate the user pool to coredao pool", async () => {
    await Vault.connect(deployerSigner).add(100, CoreDAO.address, true, true)

    const coreBalanceBefore = await Core.balanceOf(user)

    // amount, rewardDebt
    const balancesBefore = [
      await Vault.userInfo(0, user),
      await Vault.userInfo(1, user),
      await Vault.userInfo(2, user),
      await Vault.userInfo(3, user),
    ]

    expect(balancesBefore[0].amount).to.be.gt("0")
    expect(balancesBefore[1].amount).to.be.gt("0")
    expect(balancesBefore[2].amount).to.be.gt("0")
    expect(balancesBefore[0].rewardDebt).to.be.gt("0")
    expect(balancesBefore[1].rewardDebt).to.be.gt("0")
    expect(balancesBefore[2].rewardDebt).to.be.gt("0")

    expect(balancesBefore[3].amount).to.be.equal("0")
    expect(balancesBefore[3].rewardDebt).to.be.equal("0")

    const userSigner = await ethers.getSigner(user)
    await Vault.connect(userSigner).migrateVouchers()

    const coreBalanceAfter = await Core.balanceOf(user)
    const balancesAfter = [
      await Vault.userInfo(0, user),
      await Vault.userInfo(1, user),
      await Vault.userInfo(2, user),
      await Vault.userInfo(3, user),
    ]

    expect(coreBalanceAfter).to.be.gt(coreBalanceBefore)
    expect(balancesAfter[0].amount).to.be.equal("0")
    expect(balancesAfter[1].amount).to.be.equal("0")
    expect(balancesAfter[2].amount).to.be.equal("0")
    expect(balancesAfter[0].rewardDebt).to.be.equal("0")
    expect(balancesAfter[1].rewardDebt).to.be.equal("0")
    expect(balancesAfter[2].rewardDebt).to.be.equal("0")

    expect(balancesAfter[3].amount).to.be.gt("0")
    expect(balancesAfter[3].rewardDebt).to.be.equal("0")
  })
})
