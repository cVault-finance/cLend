// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title Library housing all the different function helpers that take space in the main contract
 * @author CVault Finance
 */
library CLendingLibrary {
    function safeTransferFrom(
        IERC20 token,
        address person,
        uint256 sendAmount
    ) internal returns (uint256 transferedAmount) {
        uint256 balanceBefore = token.balanceOf(address(this));
        token.transferFrom(person, address(this), sendAmount);
        uint256 balanceAfter = token.balanceOf(address(this));

        transferedAmount = balanceAfter - balanceBefore;
        require(transferedAmount == sendAmount, "CLending: UNSUPPORTED_TOKEN");
    }
}
