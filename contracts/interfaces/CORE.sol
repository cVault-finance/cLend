// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

interface CORE {
    function transferCheckerAddress() external view returns (address);
}

interface TransferChecker {
    function editNoFeeRecipentList(address _address, bool noFee) external;
    function editNoFeeList(address _address, bool noFee) external;

    function noFeeRecipent(address _address) external view returns (bool);
}
