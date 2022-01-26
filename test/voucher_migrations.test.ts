import { expect } from "chai"
import { Signer, utils } from "ethers"
import hre, { ethers, deployments, network } from "hardhat"
import { CLending, CoreDAO, CoreDAOTreasury, CoreVaultV3, IERC20, MockProxyAdmin } from "../types"
import { impersonate } from "./utilities"

const DEPLOYER = "0x5A16552f59ea34E44ec81E58b3817833E9fD5436"
const COREDAO = "0xf66Cd2f8755a21d3c8683a10269F795c0532Dd58"

const LP1_VOUCHER = "0xF6Dd68031a22c8A3F1e7a424cE8F43a1e1A3be3E"
const LP2_VOUCHER = "0xb8ee07B5ED2FF9dae6C504C9dEe84151F844a591"
const LP3_VOUCHER = "0xcA00F8eef4cE1F9183E06fA25fE7872fEDcf7456"

const xRevert = "0xd5b47b80668840e7164c1d1d81af8a9d9727b421"

describe("vouchers migration", async () => {
  let snapshot
  let deployerSigner
  let CLending: CLending
  let CoreDAOTreasury: CoreDAOTreasury
  let CoreDAO: CoreDAO
  let VoucherLp1: IERC20
  let VoucherLp2: IERC20
  let VoucherLp3: IERC20
  let xRevertSigner

  before(async () => {
    await deployments.fixture()
    await impersonate(DEPLOYER)
    await impersonate(xRevert)

    xRevertSigner = await ethers.getSigner(xRevert)
    deployerSigner = await ethers.getSigner(DEPLOYER)

    CLending = await ethers.getContract<CLending>("CLending")
    CoreDAO = await ethers.getContractAt<CoreDAO>("CoreDAO", COREDAO)
    CoreDAOTreasury = await ethers.getContract<CoreDAOTreasury>("CoreDAOTreasury")

    VoucherLp1 = await ethers.getContractAt<IERC20>("IERC20", LP1_VOUCHER)
    VoucherLp2 = await ethers.getContractAt<IERC20>("IERC20", LP2_VOUCHER)
    VoucherLp3 = await ethers.getContractAt<IERC20>("IERC20", LP3_VOUCHER)

    console.log(await CoreDAOTreasury.coreDAO())
    snapshot = await ethers.provider.send("evm_snapshot", [])
  })

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshot])
    snapshot = await ethers.provider.send("evm_snapshot", [])
  })

  it("should migrate", async () => {
    let lp1Amount = await VoucherLp1.balanceOf(xRevert)
    let lp2Amount = await VoucherLp2.balanceOf(xRevert)
    let lp3Amount = await VoucherLp3.balanceOf(xRevert)
    let coreDaoAmount = await CoreDAO.balanceOf(xRevert)

    console.log("> before migration")
    console.table([
      {
        lp1: lp1Amount.toString(),
        lp2: lp2Amount.toString(),
        lp3: lp3Amount.toString(),
        coreDao: coreDaoAmount.toString(),
      },
    ])

    await VoucherLp1.connect(xRevertSigner).approve(CoreDAOTreasury.address, lp1Amount)
    await VoucherLp2.connect(xRevertSigner).approve(CoreDAOTreasury.address, lp2Amount)
    await VoucherLp3.connect(xRevertSigner).approve(CoreDAOTreasury.address, lp3Amount)

    await CoreDAOTreasury.connect(xRevertSigner).wrapVouchers(xRevert, lp1Amount, lp2Amount, lp3Amount)

    console.log("> after migration")
    lp1Amount = await VoucherLp1.balanceOf(xRevert)
    lp2Amount = await VoucherLp2.balanceOf(xRevert)
    lp3Amount = await VoucherLp3.balanceOf(xRevert)
    coreDaoAmount = await CoreDAO.balanceOf(xRevert)
    console.table([
      {
        lp1: lp1Amount.toString(),
        lp2: lp2Amount.toString(),
        lp3: lp3Amount.toString(),
        coreDao: coreDaoAmount.toString(),
      },
    ])
  })
})
