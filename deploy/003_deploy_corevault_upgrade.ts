import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { ethers, network } from "hardhat"
import { CoreDAO, CoreDAOTreasury, CoreVaultV3, MockProxyAdmin } from "../types"
import { impersonate } from "../test/utilities"

const DEPLOYER = "0x5A16552f59ea34E44ec81E58b3817833E9fD5436"
const ADMIN_PROXY = "0x9cb1eEcCd165090a4a091209E8c3a353954B1f0f"
const VAULT = "0xC5cacb708425961594B63eC171f4df27a9c0d8c9"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy } = deployments

  const { deployer } = await getNamedAccounts()
  const AdminProxy = await ethers.getContractAt<MockProxyAdmin>("MockProxyAdmin", ADMIN_PROXY)
  const CoreDAO = await ethers.getContract<CoreDAO>("CoreDAO")
  const CoreDAOTreasury = await ethers.getContract<CoreDAOTreasury>("CoreDAOTreasury")

  await deploy("CoreVaultV3", {
    from: deployer,
    log: true,
    args: [CoreDAO.address, CoreDAOTreasury.address],
    deterministicDeployment: false,
  })

  if (!network.live) {
    console.log("Upgrading to CoreVaultV3...")
    const CoreVaultV3 = await ethers.getContract<CoreVaultV3>("CoreVaultV3")
    await impersonate(DEPLOYER)
    const deployerSigner = await ethers.getSigner(DEPLOYER)
    await AdminProxy.connect(deployerSigner).upgrade(VAULT, CoreVaultV3.address)
  }
}

export default func
func.tags = ["CoreVaultV3"]
func.dependencies = ["CoreDAO"]
