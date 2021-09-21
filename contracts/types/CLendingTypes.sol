// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

struct DebtorSummary {
    uint256 timeLastBorrow; // simple timestamp
    uint256 amountDAIBorrowed; // denominated in DAI units (1e18)
    // Meaning 1 DAI = 1e18 here since DAI is 1e18
    Collateral[] collateral;
}

struct Collateral {
    address collateralAddress;
    uint256 suppliedCollateral;
}
