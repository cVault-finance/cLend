// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "hardhat/console.sol";

// Library housing all the different function helpers that take space in the main contract
library CLendingLibrary {
    function safeTransferFrom(
        IERC20 token,
        address person,
        uint256 sendAmount
    ) internal returns (uint256 transferedAmount) {
        console.log("to", address(this));
        uint256 balanceBefore = token.balanceOf(address(this));
        token.transferFrom(person, address(this), sendAmount);
        uint256 balanceAfter = token.balanceOf(address(this));

        transferedAmount = balanceAfter - balanceBefore;
        require(transferedAmount == sendAmount, "Unsupported broken or FoT token");
    }
}
