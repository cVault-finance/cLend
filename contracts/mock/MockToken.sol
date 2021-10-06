// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title Mock ERC20 token for test
 */
contract MockToken is ERC20 {
    constructor() ERC20("Test", "Test") {
        _mint(msg.sender, 1e24);
    }
}
