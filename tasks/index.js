const { task } = require("hardhat/config");

const {
  ethers: {
    constants: { MaxUint256 },
  },
} = require("ethers");

task("accounts", "Prints the list of accounts", require("./accounts"));
task("gas-price", "Prints gas price").setAction(async function (
  { address },
  { ethers }
) {
  console.log("Gas price", (await ethers.provider.getGasPrice()).toString());
});

task("bytecode", "Prints bytecode").setAction(async function (
  { address },
  { ethers }
) {
  console.log("Bytecode", await ethers.provider.getCode(address));
});

task("erc20:approve", "ERC20 approve")
  .addParam("token", "Token")
  .addParam("spender", "Spender")
  .addOptionalParam("deadline", MaxUint256)
  .setAction(async function (
    { token, spender, deadline },
    { ethers: { getNamedSigner } },
    runSuper
  ) {
    const erc20 = await ethers.getContractFactory("UniswapV2ERC20");

    const slp = erc20.attach(token);

    await (
      await slp.connect(await getNamedSigner("dev")).approve(spender, deadline)
    ).wait();
  });
