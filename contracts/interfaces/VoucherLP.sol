// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface VoucherLP is IERC20 {
    function wrap() external returns (uint256);
}