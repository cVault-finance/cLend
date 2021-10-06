// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

/**
 * @title Mock ETH distributor
 */
contract MockEthDistributor {
    receive() external payable {}

    function distribute(address payable _dest) external {
        selfdestruct(_dest);
    }
}
