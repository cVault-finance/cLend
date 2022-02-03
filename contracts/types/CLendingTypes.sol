// SPDX-License-Identifier: UNLICENSED

pragma solidity =0.8.6;

struct DebtorSummary {
    uint256 timeLastBorrow; // simple timestamp
    uint256 amountDAIBorrowed; // denominated in DAI units (1e18)
    uint256 pendingInterests; // interests accumulated from previous loans
    // Meaning 1 DAI = 1e18 here since DAI is 1e18
    mapping(address => Collateral) positions;
}

struct Collateral {
    address collateralAddress;
    uint256 amountCollateral;
}
