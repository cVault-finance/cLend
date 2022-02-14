import { expect } from "chai"
import { BigNumber, Signer } from "ethers"
import { ethers, deployments, network, getNamedAccounts } from "hardhat"
import { CoreDAO, CoreDAOTreasury, CoreGovernor, CoreVaultWithVoting, IERC20, TimelockController } from "../types"
import { TimelockController__factory } from "../types/factories/TimelockController__factory"
import { advanceBlock, advanceBlockTo, advanceTimeAndBlock, blockNumber, getBigNumber, impersonate } from "./utilities"
import { constants } from "../constants"
import { parseEther } from "ethers/lib/utils"
import { time } from "console"

const DEPLOYER = "0x5A16552f59ea34E44ec81E58b3817833E9fD5436"
const VAULT = "0xC5cacb708425961594B63eC171f4df27a9c0d8c9"

const amountAlice = getBigNumber(100_000);
const amountBob = getBigNumber(50_000);

describe("CoreGovernor", async () => {
  let snapshot
  let CoreDAO: CoreDAO
  let CoreGovernor: CoreGovernor
  let deployerSigner
  let Vault: CoreVaultWithVoting
  let CoreDAOTreasury: CoreDAOTreasury
  let TimelockController: TimelockController

  before(async () => {
    await deployments.fixture()
    CoreDAO = await ethers.getContract("CoreDAO")
    CoreGovernor = await ethers.getContract("CoreGovernor")
    CoreDAOTreasury = await ethers.getContract<CoreDAOTreasury>("CoreDAOTreasury")
    TimelockController = await ethers.getContract<TimelockController>("TimelockController")

    await impersonate(DEPLOYER)
    await impersonate(CoreDAOTreasury.address);

    deployerSigner = await ethers.getSigner(DEPLOYER)

    Vault = await ethers.getContractAt<CoreVaultWithVoting>("CoreVaultWithVoting", VAULT)
    snapshot = await ethers.provider.send("evm_snapshot", [])
  })

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshot])
    snapshot = await ethers.provider.send("evm_snapshot", [])
  })

  describe("staking", async () => {
    beforeEach(async () => {
      const [deployer, alice, bob] = await ethers.getSigners();

      const treasurySigner = await ethers.getSigner(CoreDAOTreasury.address);
      await CoreDAO.connect(treasurySigner).issue(alice.address, amountAlice);
      await CoreDAO.connect(treasurySigner).issue(bob.address, amountBob);

      const blockBeforeDeposit = await blockNumber();
      await advanceBlock();

      expect(await CoreGovernor.getVotes(alice.address, blockBeforeDeposit)).to.be.eq(0)
      expect(await CoreGovernor.getVotes(bob.address, blockBeforeDeposit)).to.be.eq(0)

      await CoreDAO.connect(alice).approve(Vault.address, amountAlice);
      await CoreDAO.connect(bob).approve(Vault.address, amountBob);

      await Vault.connect(alice).deposit(3, amountAlice);
      await Vault.connect(bob).deposit(3, amountBob);

      const blockAfterDeposit = await blockNumber();
      await advanceBlock();

      // no voting right weight since no delegate
      expect(await CoreGovernor.getVotes(alice.address, blockAfterDeposit)).to.be.eq(0)
      expect(await CoreGovernor.getVotes(bob.address, blockAfterDeposit)).to.be.eq(0)
    });
    
    it("should have voting weight when delegating to themselves", async () => {
      const [deployer, alice, bob] = await ethers.getSigners();

      const stCoreDAOBalances = [await Vault.balanceOf(alice.address), await Vault.balanceOf(bob.address)]

      expect(stCoreDAOBalances[0]).to.be.gt(0)
      expect(stCoreDAOBalances[1]).to.be.gt(0)

      await Vault.connect(alice).delegate(alice.address)
      await Vault.connect(bob).delegate(bob.address)

      const blockNo = await blockNumber()
      await advanceBlock()
      expect(await CoreGovernor.getVotes(alice.address, blockNo)).to.be.eq(stCoreDAOBalances[0])
      expect(await CoreGovernor.getVotes(bob.address, blockNo)).to.be.eq(stCoreDAOBalances[1])
    })

    it("should loss voting weight when delegating to themselves but withdrawing from the vault", async () => {
      const [deployer, alice, bob] = await ethers.getSigners();

      const stCoreDAOBalance = await Vault.balanceOf(alice.address)

      await Vault.connect(alice).delegate(alice.address)
      let blockNo = await blockNumber()
      await advanceBlock()

      expect(await CoreGovernor.getVotes(alice.address, blockNo)).to.be.eq(stCoreDAOBalance)

      await Vault.withdraw(3, 0)

      blockNo = await blockNumber()
      await advanceBlock()
      expect(await CoreGovernor.getVotes(alice.address, blockNo)).to.be.eq(stCoreDAOBalance)

      const userInfo = await Vault.userInfo(3, alice.address)
      await Vault.connect(alice).withdraw(3, userInfo.amount)
      expect(await Vault.balanceOf(alice.address)).to.be.eq(0)
      expect((await Vault.userInfo(3, alice.address)).amount).to.be.eq(0)

      blockNo = await blockNumber()
      await advanceBlock()
      expect(await CoreGovernor.getVotes(alice.address, blockNo)).to.be.eq(0)
    })

    it("should not loss all voting weight when delegating to themselves but withdrawing some from the vault", async () => {
      const [deployer, alice, bob] = await ethers.getSigners();

      const stCoreDAOBalance = await Vault.balanceOf(alice.address)

      await Vault.connect(alice).delegate(alice.address)
      let blockNo = await blockNumber()
      await advanceBlock()

      expect(await CoreGovernor.getVotes(alice.address, blockNo)).to.be.eq(stCoreDAOBalance)

      await Vault.withdraw(3, 0)

      blockNo = await blockNumber()
      await advanceBlock()
      expect(await CoreGovernor.getVotes(alice.address, blockNo)).to.be.eq(stCoreDAOBalance)

      const userInfo = await Vault.userInfo(3, alice.address)
      await Vault.connect(alice).withdraw(3, userInfo.amount.div(2))
      expect(await Vault.balanceOf(alice.address)).to.be.closeTo(userInfo.amount.div(2), 2)
      expect((await Vault.userInfo(3, alice.address)).amount).to.be.closeTo(userInfo.amount.div(2), 2)

      blockNo = await blockNumber()
      await advanceBlock()
      expect(await CoreGovernor.getVotes(alice.address, blockNo)).to.be.closeTo(stCoreDAOBalance.div(2), 2)
    })

    it("should delegate voting to another alice.address", async () => {
      const [deployer, alice, bob] = await ethers.getSigners();

      const stCoreDAOBalance = await Vault.balanceOf(alice.address)
      const stCoreDAOBalance2 = await Vault.balanceOf(bob.address)
      let blockNo

      await Vault.connect(alice).delegate(alice.address)
      await Vault.connect(bob).delegate(alice.address)

      blockNo = await blockNumber()
      await advanceBlock()
      expect(await CoreGovernor.getVotes(alice.address, blockNo)).to.be.eq(stCoreDAOBalance.add(stCoreDAOBalance2))
    })

    it("should not loss all voting weight from other delegators when the delegatee withdraw all his token from the vault", async () => {
      const [deployer, alice, bob] = await ethers.getSigners();

      const stCoreDAOBalance = await Vault.balanceOf(alice.address)
      const stCoreDAOBalance2 = await Vault.balanceOf(bob.address)
      let blockNo

      await Vault.connect(alice).delegate(alice.address)
      await Vault.connect(bob).delegate(alice.address)

      blockNo = await blockNumber()
      await advanceBlock()
      expect(await CoreGovernor.getVotes(alice.address, blockNo)).to.be.eq(stCoreDAOBalance.add(stCoreDAOBalance2))

      const userInfo = await Vault.userInfo(3, alice.address)
      await Vault.connect(alice).withdraw(3, userInfo.amount)
      expect(await Vault.balanceOf(alice.address)).to.be.eq(0)
      expect((await Vault.userInfo(3, alice.address)).amount).to.be.eq(0)

      blockNo = await blockNumber()
      await advanceBlock()

      // User lost his own voting weight but still has delegators
      expect(await CoreGovernor.getVotes(alice.address, blockNo)).to.be.eq(stCoreDAOBalance2)
    })

    it("should add more voting weight when staking more and remove it once withdrawn", async () => {
      const [deployer, alice, bob] = await ethers.getSigners();

      const stCoreDAOBalance = await Vault.balanceOf(alice.address)
      let stCoreDAOBalance2 = await Vault.balanceOf(bob.address)
      let blockNo

      await Vault.connect(alice).delegate(alice.address)
      await Vault.connect(bob).delegate(alice.address)

      const amountAdded = getBigNumber(123456789)
      await impersonate(CoreDAOTreasury.address)
      const treasurySigner = await ethers.getSigner(CoreDAOTreasury.address)
      await CoreDAO.connect(treasurySigner).issue(bob.address, amountAdded)

      blockNo = await blockNumber()
      await advanceBlock()
      expect(await CoreGovernor.getVotes(alice.address, blockNo)).to.be.eq(stCoreDAOBalance.add(stCoreDAOBalance2))

      await CoreDAO.connect(bob).approve(Vault.address, amountAdded)
      await Vault.connect(bob).deposit(3, amountAdded)

      blockNo = await blockNumber()
      await advanceBlock()
      expect(await CoreGovernor.getVotes(alice.address, blockNo)).to.be.eq(stCoreDAOBalance.add(stCoreDAOBalance2).add(amountAdded))

      stCoreDAOBalance2 = await Vault.balanceOf(bob.address)
      await Vault.connect(bob).withdraw(3, stCoreDAOBalance2)

      blockNo = await blockNumber()
      await advanceBlock()
      expect(await CoreGovernor.getVotes(alice.address, blockNo)).to.be.eq(stCoreDAOBalance)
    })
  })

  describe("proposal lifecycle", async () => {

    it("should not be able to have votes weight when not staking", async () => {
      const [deployer, alice, bob] = await ethers.getSigners();
      const abiCoder = ethers.utils.defaultAbiCoder
      const treasurySigner = await ethers.getSigner(CoreDAOTreasury.address)

      await CoreDAO.connect(treasurySigner).issue(alice.address, getBigNumber("69"))
      await CoreDAO.connect(alice).approve(VAULT, ethers.constants.MaxUint256)
      await Vault.connect(alice).deposit(3, await CoreDAO.balanceOf(alice.address))

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
      await expect(CoreGovernor.connect(alice).castVote(proposalId, 0)).to.be.revertedWith("Governor: vote not currently active")
      await advanceBlock()

      // Should not count toward voting weight since it was delegated after the proposal creation
      await Vault.connect(alice).delegate(alice.address)

      // Vote should not count
      await CoreGovernor.connect(alice).castVote(proposalId, 0)
      expect(await CoreGovernor.hasVoted(proposalId, alice.address)).to.be.true

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
      const [deployer, alice, bob, charlie] = await ethers.getSigners()
      const treasurySigner = await ethers.getSigner(CoreDAOTreasury.address)

      await CoreDAO.connect(treasurySigner).issue(alice.address, getBigNumber("69"))
      await CoreDAO.connect(treasurySigner).issue(bob.address, getBigNumber("42"))
      await CoreDAO.connect(treasurySigner).issue(CoreDAOTreasury.address, getBigNumber("123456"))

      expect(await CoreDAO.balanceOf(charlie.address)).to.be.eq("0")
      await CoreDAO.connect(alice).approve(VAULT, ethers.constants.MaxUint256)
      await CoreDAO.connect(bob).approve(VAULT, ethers.constants.MaxUint256)

      await Vault.connect(alice).delegate(alice.address)
      await Vault.connect(bob).delegate(alice.address)

      await Vault.connect(alice).deposit(3, await CoreDAO.balanceOf(alice.address))
      await Vault.connect(bob).deposit(3, await CoreDAO.balanceOf(bob.address))

      // Transfer treasury ownership to core governor
      await CoreDAOTreasury.connect(deployerSigner).transferOwnership(TimelockController.address)
      const abiCoder = ethers.utils.defaultAbiCoder

      const functionCall = [CoreDAOTreasury.interface.encodeFunctionData("pay", [CoreDAO.address, charlie.address, getBigNumber("123456"), "benis"])]

      const tx = await (await CoreGovernor.propose([CoreDAOTreasury.address], ["0"], functionCall, "dummy")).wait()
      let proposalId = tx.events![0].args!.proposalId.toString()

      await advanceBlock()
      await CoreGovernor.connect(alice).castVote(proposalId, 1)

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

      expect(await CoreDAO.balanceOf(charlie.address)).to.be.eq(getBigNumber("123456"))
    })
  })
})
