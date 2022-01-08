import { expect } from "chai"
import { BigNumber, Signer } from "ethers"
import { ethers, deployments, network } from "hardhat"
import { CoreDAO, CoreGovernor, IERC20, TimelockController } from "../types"
import { TimelockController__factory } from "../types/factories/TimelockController__factory"
import { getBigNumber, impersonate } from "./utilities"
import { constants } from "../constants"
import { parseEther } from "ethers/lib/utils"

const FORK_BLOCKNUMBER = 13919761

describe("CoreGovernor", async () => {
  let coredao: CoreDAO
  let coreGovernor: CoreGovernor

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
    coredao = await ethers.getContract("CoreDAO")
    coreGovernor = await ethers.getContract("CoreGovernor")
  })

  it("should have voting weight", async () => {
    const [alice] = await ethers.getSigners()
    expect(await coreGovernor.getVotes(alice.address, FORK_BLOCKNUMBER)).to.be.eq("0")
  })
})
