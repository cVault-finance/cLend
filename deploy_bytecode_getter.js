const { ethers, Wallet, ContractFactory, Provider } = require("ethers");
const fs = require('fs');

const unpackArtifact = (artifactPath) => {
    let contractData = JSON.parse(fs.readFileSync(artifactPath))
    const contractBytecode = contractData['bytecode']
    const contractABI = contractData['abi']
    const constructorArgs = contractABI.filter((itm) => {
        return itm.type == 'constructor'
    })
    let constructorStr;
    if(constructorArgs.length < 1) {
        constructorStr = "    -- No constructor arguments -- "
    }
    else {
        constructorJSON = constructorArgs[0].inputs
        constructorStr = JSON.stringify(constructorJSON.map((c) => {
            return {
                name: c.name,
                type: c.type
            }
        }))
    }
    return {
        abi: contractABI,
        bytecode: contractBytecode,
        description:`  ${contractData.contractName}\n    ${constructorStr}`
    }
}

const deployTokenFromSigner = (contractABI, contractBytecode, wallet, args = []) => {

    const factory = new ContractFactory(contractABI, contractBytecode)
    let deployTx = factory.getDeployTransaction(...args)
    console.log(deployTx)
    // deployTokenFromSigner(tokenUnpacked.abi, tokenUnpacked.bytecode, provider, tokenArgs)
}

const getContractDeployTx = (contractABI, contractBytecode, wallet, provider, args = []) => {
    const factory = new ContractFactory(contractABI, contractBytecode, wallet.connect(provider))
    let txRequest = factory.getDeployTransaction(...args)
    return txRequest
}

const deployContract = async (contractABI, contractBytecode, wallet, provider, args = []) => {
    const factory = new ContractFactory(contractABI, contractBytecode, wallet.connect(provider))
    return await factory.deploy(...args);
}

const deployCoreDAO = async (mnemonic = "", mainnet = false) => {

    // Get the built metadata for our contracts
    let tokenUnpacked = unpackArtifact("./artifacts/contracts/CoreDAO.sol/CoreDAO.json")
    console.log(tokenUnpacked.description)

    let provider;
    // let wethAddress;
    
    if(mainnet) {
        provider = ethers.getDefaultProvider("homestead")
        // wethAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
    }
    else {
        provider = ethers.getDefaultProvider("kovan")
        // wethAddress = "0xd0a1e359811322d97991e03f863a0c30c2cf029c"
    }

    const tokenArgs = [
        uniswapRouterAddress,
        uniswapFactoryAddress
    ]
    
    deployTokenFromSigner(tokenUnpacked.abi, tokenUnpacked.bytecode, provider, tokenArgs)

}

const deployCoreVault = (coreTokenAddress = "0x62359ed7505efc61ff1d56fef82158ccaffa23d7") => {
    let coreVaultUnpacked = unpackArtifact("./artifacts/FeeApprover.json")
}

deployCoreDAO();