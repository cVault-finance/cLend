# Testing Guideline

This is a summary of what it required for testing the smart contracts. The basic infrastructure for testing, the testing environment, is already put in place and ready to be used.

# WIP

Some test file contains WIP with empty test case, they should be completed and were written there as a reminder of what is required to be tested.

# Audit

If a bug is found in a contract and a fix is made, a test case should first test that the bug is happenning (failing test) and when the fix is made, the test passing.

# IDE

VSCode should be used as the IDE. When the project is opened it should suggest to install the recommended extensions. After those are installed and `yarn` ran as well, vscode should be restarted.

## Testing environement

The environement is configured to use `hardhat-deploy`, `ethers` and `waffle`. `hardat-deploy` makes it possible to use the same deployment scripts used for testing and for mainnet deployment. At each `beforeEach` block, when `await deployments.fixture()` is used, it automatically resets the blocknumber and redeployment every contract from `deploy/` folder so that each test case are isolated.

Tests are ran with hardhat node at a given blocknumber. The fork blocknumber is set in `.env.defaults` and `hardhat.config.ts` dictate to use it to spawn a hardhat node that's set to a blocknumber for testing.

## Code Coverage

We should aim to have 100% code coverage.

```
yarn coverage
```

## Testing suite

Each test scenario should be covered with a `it should` block and have a sentence that's meaningful. They should not be interdependent and use the `beforeEach` functionnality for the setup.

## .env

`.env` file can be used to override variables defined inside `.env.defaults` but not versionned. The default fork mainnet block should be mentionned in `.env.defaults`

## Typechain

Typechain is used to generate typescript definition files from the contract's compilation process. It allows to have suggestion/auto-completion in vscode. If they are not updated properly run `yarn rebuild`.
If some `import` statement fails to "see" the definition, a quickfix is to open one of the definition in the `types/` folder and it should update the vscode typescript typing cache.
