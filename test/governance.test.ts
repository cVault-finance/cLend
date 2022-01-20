import { expect } from "chai"
import { BigNumber, Signer } from "ethers"
import { ethers, deployments, network, getNamedAccounts } from "hardhat"
import { CoreDAO, CoreDAOTreasury, CoreGovernor, CoreVaultV3, IERC20, TimelockController } from "../types"
import { TimelockController__factory } from "../types/factories/TimelockController__factory"
import { advanceBlock, advanceBlockTo, advanceTimeAndBlock, blockNumber, getBigNumber, impersonate } from "./utilities"
import { constants } from "../constants"
import { parseEther } from "ethers/lib/utils"
import { time } from "console"

const FORK_BLOCKNUMBER = 13965334
const DEPLOYER = "0x5A16552f59ea34E44ec81E58b3817833E9fD5436"
const VAULT = "0xC5cacb708425961594B63eC171f4df27a9c0d8c9"

const user = "0x1cb3fae03e5f73df7cbbc75e1d236dc459c72436"
const user2 = "0x0932dc25c2eca97908d632eb0702d3feceb84455"

xdescribe("CoreGovernor", async () => {
  let snapshot
  let CoreDAO: CoreDAO
  let CoreGovernor: CoreGovernor
  let user1Signer
  let user2Signer
  let deployerSigner
  let Vault: CoreVaultV3
  let CoreDAOTreasury: CoreDAOTreasury
  let TimelockController: TimelockController

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
    CoreDAOTreasury = await ethers.getContract<CoreDAOTreasury>("CoreDAOTreasury")
    TimelockController = await ethers.getContract<TimelockController>("TimelockController")

    await impersonate(DEPLOYER)
    await impersonate(user)
    await impersonate(user2)

    deployerSigner = await ethers.getSigner(DEPLOYER)
    user1Signer = await ethers.getSigner(user)
    user2Signer = await ethers.getSigner(user2)

    Vault = await ethers.getContractAt<CoreVaultV3>("CoreVaultV3", VAULT)
    snapshot = await ethers.provider.send("evm_snapshot", [])
  })

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshot])
    snapshot = await ethers.provider.send("evm_snapshot", [])
  })

  describe("staking", async () => {
    beforeEach(async () => {
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

    it("should not loss all voting weight when delegating to themselves but withdrawing some from the vault", async () => {
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
      await Vault.connect(user1Signer).withdraw(3, userInfo.amount.div(2))
      expect(await Vault.balanceOf(user)).to.be.closeTo(userInfo.amount.div(2), 2)
      expect((await Vault.userInfo(3, user)).amount).to.be.closeTo(userInfo.amount.div(2), 2)

      blockNo = await blockNumber()
      await advanceBlock()
      expect(await CoreGovernor.getVotes(user1Signer.address, blockNo)).to.be.closeTo(stCoreDAOBalance.div(2), 2)
    })

    it("should delegate voting to another user", async () => {
      const stCoreDAOBalance = await Vault.balanceOf(user)
      const stCoreDAOBalance2 = await Vault.balanceOf(user2)
      let blockNo

      await Vault.connect(user1Signer).delegate(user1Signer.address)
      await Vault.connect(user2Signer).delegate(user1Signer.address)

      blockNo = await blockNumber()
      await advanceBlock()
      expect(await CoreGovernor.getVotes(user1Signer.address, blockNo)).to.be.eq(stCoreDAOBalance.add(stCoreDAOBalance2))
    })

    it("should not loss all voting weight from other delegators when the delegatee withdraw all his token from the vault", async () => {
      const stCoreDAOBalance = await Vault.balanceOf(user)
      const stCoreDAOBalance2 = await Vault.balanceOf(user2)
      let blockNo

      await Vault.connect(user1Signer).delegate(user1Signer.address)
      await Vault.connect(user2Signer).delegate(user1Signer.address)

      blockNo = await blockNumber()
      await advanceBlock()
      expect(await CoreGovernor.getVotes(user1Signer.address, blockNo)).to.be.eq(stCoreDAOBalance.add(stCoreDAOBalance2))

      const userInfo = await Vault.userInfo(3, user)
      await Vault.connect(user1Signer).withdraw(3, userInfo.amount)
      expect(await Vault.balanceOf(user)).to.be.eq("0")
      expect((await Vault.userInfo(3, user)).amount).to.be.eq("0")

      blockNo = await blockNumber()
      await advanceBlock()

      // User lost his own voting weight but still has delegators
      expect(await CoreGovernor.getVotes(user1Signer.address, blockNo)).to.be.eq(stCoreDAOBalance2)
    })

    it("should add more voting weight when staking more and remove it once withdrawn", async () => {
      const stCoreDAOBalance = await Vault.balanceOf(user)
      let stCoreDAOBalance2 = await Vault.balanceOf(user2)
      let blockNo

      await Vault.connect(user1Signer).delegate(user1Signer.address)
      await Vault.connect(user2Signer).delegate(user1Signer.address)

      const amountAdded = getBigNumber(123456789)
      await impersonate(CoreDAOTreasury.address)
      const treasurySigner = await ethers.getSigner(CoreDAOTreasury.address)
      await CoreDAO.connect(treasurySigner).issue(user2, amountAdded)

      blockNo = await blockNumber()
      await advanceBlock()
      expect(await CoreGovernor.getVotes(user1Signer.address, blockNo)).to.be.eq(stCoreDAOBalance.add(stCoreDAOBalance2))

      await CoreDAO.connect(user2Signer).approve(Vault.address, amountAdded)
      await Vault.connect(user2Signer).deposit(3, amountAdded)

      blockNo = await blockNumber()
      await advanceBlock()
      expect(await CoreGovernor.getVotes(user1Signer.address, blockNo)).to.be.eq(stCoreDAOBalance.add(stCoreDAOBalance2).add(amountAdded))

      stCoreDAOBalance2 = await Vault.balanceOf(user2)
      await Vault.connect(user2Signer).withdraw(3, stCoreDAOBalance2)

      blockNo = await blockNumber()
      await advanceBlock()
      expect(await CoreGovernor.getVotes(user1Signer.address, blockNo)).to.be.eq(stCoreDAOBalance)
    })
  })

  it("should not be able to have votes weight when not staking", async () => {
    const [deployer, user1, user2, user3] = await ethers.getSigners()
    await Vault.connect(deployerSigner).add(100, CoreDAO.address, true, true)
    const abiCoder = ethers.utils.defaultAbiCoder

    await impersonate(CoreDAOTreasury.address)
    const treasurySigner = await ethers.getSigner(CoreDAOTreasury.address)

    await CoreDAO.connect(treasurySigner).issue(user1.address, getBigNumber("69"))
    await CoreDAO.connect(user1).approve(VAULT, ethers.constants.MaxUint256)
    await Vault.connect(user1).deposit(3, await CoreDAO.balanceOf(user1.address))

    const tx = await (
      await CoreGovernor.propose(
        [CoreGovernor.address],
        ["0"],
        [abiCoder.encode(["address", "address", "uint256", "string"], [ethers.constants.AddressZero, ethers.constants.AddressZero, "0", ""])],
        "dummy"
      )
    ).wait()
    let proposalId = tx.events![0].args!.proposalId.toString()

    // Should be able to vote after 1 block
    await expect(CoreGovernor.connect(user1).castVote(proposalId, 0)).to.be.revertedWith("Governor: vote not currently active")
    await advanceBlock()

    // Should not count toward voting weight since it was delegated after the proposal creation
    await Vault.connect(user1).delegate(user1.address)

    // Vote should not count
    await CoreGovernor.connect(user1).castVote(proposalId, 0)
    expect(await CoreGovernor.hasVoted(proposalId, user1.address)).to.be.true

    const proposalVotes = await CoreGovernor.proposalVotes(proposalId)
    expect(proposalVotes.againstVotes).to.be.eq("0")
    expect(proposalVotes.forVotes).to.be.eq("0")
    expect(proposalVotes.abstainVotes).to.be.eq("0")
  })

  it("should pay from treasury using a proposal executed by the governor", async () => {
    /**
      enum VoteType {
        Against, // 0
        For, // 1
        Abstain // 2
    }
     */
    const [deployer, user1, user2, user3] = await ethers.getSigners()
    await Vault.connect(deployerSigner).add(100, CoreDAO.address, true, true)
    await impersonate(CoreDAOTreasury.address)
    const treasurySigner = await ethers.getSigner(CoreDAOTreasury.address)

    await CoreDAO.connect(treasurySigner).issue(user1.address, getBigNumber("69"))
    await CoreDAO.connect(treasurySigner).issue(user2.address, getBigNumber("42"))
    await CoreDAO.connect(treasurySigner).issue(CoreDAOTreasury.address, getBigNumber("123456"))

    expect(await CoreDAO.balanceOf(user3.address)).to.be.eq("0")
    await CoreDAO.connect(user1).approve(VAULT, ethers.constants.MaxUint256)
    await CoreDAO.connect(user2).approve(VAULT, ethers.constants.MaxUint256)

    await Vault.connect(user1).delegate(user1.address)
    await Vault.connect(user2).delegate(user1.address)

    await Vault.connect(user1).deposit(3, await CoreDAO.balanceOf(user1.address))
    await Vault.connect(user2).deposit(3, await CoreDAO.balanceOf(user2.address))

    // Transfer treasury ownership to core governor
    await CoreDAOTreasury.connect(deployerSigner).transferOwnership(TimelockController.address)
    const abiCoder = ethers.utils.defaultAbiCoder

    const functionCall = [CoreDAOTreasury.interface.encodeFunctionData("pay", [CoreDAO.address, user3.address, getBigNumber("123456"), "benis"])]

    const tx = await (await CoreGovernor.propose([CoreDAOTreasury.address], ["0"], functionCall, "dummy")).wait()
    let proposalId = tx.events![0].args!.proposalId.toString()

    await advanceBlock()
    await CoreGovernor.connect(user1).castVote(proposalId, 1)

    const proposalVotes = await CoreGovernor.proposalVotes(proposalId)
    expect(proposalVotes.againstVotes).to.be.eq("0")
    expect(proposalVotes.forVotes).to.be.eq(getBigNumber("69").add(getBigNumber("42")))
    expect(proposalVotes.abstainVotes).to.be.eq("0")

    await expect(
      CoreGovernor.execute([CoreDAOTreasury.address], ["0"], functionCall, ethers.utils.keccak256(ethers.utils.toUtf8Bytes("dummy")))
    ).to.be.revertedWith("Governor: proposal not successful")

    // advance to proposal deadline, governor is using block number and not timestamp so we have to do this instead of advancing time...
    console.log("advancing blocks to proposal end...(this take some times)")
    const deadline = await CoreGovernor.proposalDeadline(proposalId)
    await advanceBlockTo(deadline)

    await expect(
      CoreGovernor.execute([CoreDAOTreasury.address], ["0"], functionCall, ethers.utils.keccak256(ethers.utils.toUtf8Bytes("dummy")))
    ).to.be.revertedWith("TimelockController: operation is not ready")

    await expect(
      CoreGovernor.execute([CoreDAOTreasury.address], ["0"], functionCall, ethers.utils.keccak256(ethers.utils.toUtf8Bytes("dummy")))
    ).to.be.revertedWith("TimelockController: operation is not ready")

    await CoreGovernor.queue([CoreDAOTreasury.address], ["0"], functionCall, ethers.utils.keccak256(ethers.utils.toUtf8Bytes("dummy")))
    await advanceTimeAndBlock(parseInt((await TimelockController.getMinDelay()).toString()))
    await CoreGovernor.execute([CoreDAOTreasury.address], ["0"], functionCall, ethers.utils.keccak256(ethers.utils.toUtf8Bytes("dummy")))

    expect(await CoreDAO.balanceOf(user3.address)).to.be.eq(getBigNumber("123456"))
  })
})
