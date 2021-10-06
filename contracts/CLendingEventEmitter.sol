// SPDX-License-Identifier: UNLICENSED

pragma solidity =0.8.6;

contract cLendingEventEmitter {
    event LoanTermsChanged(
        uint256 previousYearlyInterst,
        uint256 newYearlyInterst,
        uint256 previousLoanDefaultThresholdPercent,
        uint256 newLoanDefaultThresholdPercent,
        uint256 timestamp,
        address changedBy
    );

    event NewTokenAdded(
        address token,
        uint256 collaterability,
        address liquidationBeneficiary,
        uint256 timestamp,
        address addedBy
    );

    event TokenLiquidationBeneficiaryChanged(
        address token,
        address oldBeneficiary,
        address newBeneficiary,
        uint256 timestamp,
        address changedBy
    );

    event TokenCollaterabilityChanged(
        address token,
        uint256 oldCollaterability,
        uint256 newCollaterability,
        uint256 timestamp,
        address changedBy
    );

    event CollateralAdded(address token, uint256 amount, uint256 timestamp, address addedBy);

    event LoanTaken(uint256 amount, uint256 timestamp, address takenBy);

    event Repayment(address token, uint256 amountTokens, uint256 timestamp, address addedBy);

    event InterestPaid(address paidInToken, uint256 interestAmountInDAI, uint256 timestamp, address paidBy);

    event Liquidation(
        address userWhoWasLiquidated,
        uint256 totalCollateralValueLiquidated,
        uint256 timestamp,
        address caller
    );

    event CollateralReclaimed(address token, uint256 amount, uint256 timestamp, address byWho);
}
