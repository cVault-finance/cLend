# CORE cLend

Contracts for the CORE DAO and Lending

# Install

```bash
yarn
```

# Build

```bash
yarn build
```

# Run Tests

```bash
yarn test
```

# Run Specific Test

```bash
yarn test test/<testname>.test.js
```

# Deploy

set deployer `MNEMONIC` and `ETHERSCAN` api environment variables in project's root `.env` file

```
MNEMONIC=aaa bbb ccc ddd
ETHERSCAN_API_KEY=<the-etherscan-api-key>
```

deploy on mainnet

```
yarn mainnet:deploy
```

verify on etherscan

```
mainnet:verify
```

# Export ABI for web app

```
yarn mainnet:export
```

# Change Mainnet Fork Settings

Edit `.env.default`

# Override Environement Settings

Add a `.env` file that overrides the environement variables of `.env.defaults`.

exemple:

```bash
# .env

NODE_RPC=http://192.168.1.10:8545
```
