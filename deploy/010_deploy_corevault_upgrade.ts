import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { ethers, network } from "hardhat"
import { CoreDAO, CoreDAOTreasury, MockProxyAdmin } from "../types"
import { impersonate } from "../test/utilities"
import { CoreVaultWithVoting } from "../types/CoreVaultWithVoting"

const DEPLOYER = "0x5A16552f59ea34E44ec81E58b3817833E9fD5436"
const ADMIN_PROXY = "0x9cb1eEcCd165090a4a091209E8c3a353954B1f0f"
const VAULT = "0xC5cacb708425961594B63eC171f4df27a9c0d8c9"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy } = deployments

  const { deployer } = await getNamedAccounts()
  const AdminProxy = await ethers.getContractAt<MockProxyAdmin>("MockProxyAdmin", ADMIN_PROXY)

  await deploy("CoreVaultWithVoting", {
    from: deployer,
    log: true,
    args: [],
    deterministicDeployment: false,
  })

  const CoreVaultWithVoting = await ethers.getContract<CoreVaultWithVoting>("CoreVaultWithVoting")
  await impersonate(DEPLOYER)
  const deployerSigner = await ethers.getSigner(DEPLOYER)
  await AdminProxy.connect(deployerSigner).upgrade(VAULT, CoreVaultWithVoting.address)
}

export default func
func.tags = ["CoreVaultWithVoting"]
func.dependencies = ["Init"]
