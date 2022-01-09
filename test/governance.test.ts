import { expect } from "chai"
import { BigNumber, Signer } from "ethers"
import { ethers, deployments, network, getNamedAccounts } from "hardhat"
import { CoreDAO, CoreGovernor, CoreVaultV3, IERC20, TimelockController } from "../types"
import { TimelockController__factory } from "../types/factories/TimelockController__factory"
import { advanceBlock, blockNumber, getBigNumber, impersonate } from "./utilities"
import { constants } from "../constants"
import { parseEther } from "ethers/lib/utils"
import { time } from "console"

const FORK_BLOCKNUMBER = 13965334
const DEPLOYER = "0x5A16552f59ea34E44ec81E58b3817833E9fD5436"
const VAULT = "0xC5cacb708425961594B63eC171f4df27a9c0d8c9"

const user = "0x1cb3fae03e5f73df7cbbc75e1d236dc459c72436"
const user2 = "0x0932dc25c2eca97908d632eb0702d3feceb84455"

describe("CoreGovernor", async () => {
  let CoreDAO: CoreDAO
  let CoreGovernor: CoreGovernor
  let user1Signer
  let user2Signer
  let deployerSigner
  let Vault: CoreVaultV3

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: "https://eth-mainnet.alchemyapi.io/v2/TsLEJAhX87icgMO7ZVyPcpeEgpFEo96O",
            blockNumber: FORK_BLOCKNUMBER,
          },
        },
      ],
    })

    await deployments.fixture()
    CoreDAO = await ethers.getContract("CoreDAO")
    CoreGovernor = await ethers.getContract("CoreGovernor")

    await impersonate(DEPLOYER)
    await impersonate(user)
    await impersonate(user2)

    deployerSigner = await ethers.getSigner(DEPLOYER)
    user1Signer = await ethers.getSigner(user)
    user2Signer = await ethers.getSigner(user2)

    Vault = await ethers.getContractAt<CoreVaultV3>("CoreVaultV3", VAULT)

    // No voting weight before migration
    expect(await CoreGovernor.getVotes(user1Signer.address, FORK_BLOCKNUMBER)).to.be.eq("0")
    expect(await CoreGovernor.getVotes(user2Signer.address, FORK_BLOCKNUMBER)).to.be.eq("0")

    await Vault.connect(deployerSigner).add(100, CoreDAO.address, true, true)
    await Vault.connect(user1Signer).migrateVouchers()
    await Vault.connect(user2Signer).migrateVouchers()
  })

  it("should have no voting weight when not delegating", async () => {
    expect(await CoreGovernor.getVotes(user1Signer.address, FORK_BLOCKNUMBER)).to.be.eq("0")
    expect(await CoreGovernor.getVotes(user2Signer.address, FORK_BLOCKNUMBER)).to.be.eq("0")
  })

  it("should be not be able to delegate when balance is 0", async () => {
    const { deployer } = await getNamedAccounts()
    const deployerSigner = await ethers.getSigner(deployer)
    await Vault.connect(deployerSigner).delegate(user1Signer.address)
  })

  it("should have voting weight when delegating to themselves", async () => {
    const stCoreDAOBalances = [await Vault.balanceOf(user), await Vault.balanceOf(user2)]

    expect(stCoreDAOBalances[0]).to.be.gt("0")
    expect(stCoreDAOBalances[1]).to.be.gt("0")

    await Vault.connect(user1Signer).delegate(user1Signer.address)
    await Vault.connect(user2Signer).delegate(user2Signer.address)

    const blockNo = await blockNumber()
    await advanceBlock()
    expect(await CoreGovernor.getVotes(user1Signer.address, blockNo)).to.be.eq(stCoreDAOBalances[0])
    expect(await CoreGovernor.getVotes(user2Signer.address, blockNo)).to.be.eq(stCoreDAOBalances[1])
  })

  it("should loss voting weight when delegating to themselves but withdrawing from the vault", async () => {
    const stCoreDAOBalance = await Vault.balanceOf(user)

    await Vault.connect(user1Signer).delegate(user1Signer.address)
    let blockNo = await blockNumber()
    await advanceBlock()

    expect(await CoreGovernor.getVotes(user1Signer.address, blockNo)).to.be.eq(stCoreDAOBalance)

    await Vault.withdraw(3, 0)

    blockNo = await blockNumber()
    await advanceBlock()
    expect(await CoreGovernor.getVotes(user1Signer.address, blockNo)).to.be.eq(stCoreDAOBalance)

    const userInfo = await Vault.userInfo(3, user)
    await Vault.connect(user1Signer).withdraw(3, userInfo.amount)
    expect(await Vault.balanceOf(user)).to.be.eq("0")
    expect((await Vault.userInfo(3, user)).amount).to.be.eq("0")

    blockNo = await blockNumber()
    await advanceBlock()
    expect(await CoreGovernor.getVotes(user1Signer.address, blockNo)).to.be.eq("0")
  })
  //it("should ")
  // check delegatee voting power maintened even if unstake all
})
