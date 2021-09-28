// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

interface ICOREDAO {
    function issue(uint256, address) external;
}

contract CoreDAOTreasury is OwnableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    IERC20Upgradeable public constant LP1_VOUCHER = IERC20Upgradeable(0xF6Dd68031a22c8A3F1e7a424cE8F43a1e1A3be3E);
    IERC20Upgradeable public constant LP2_VOUCHER = IERC20Upgradeable(0xb8ee07B5ED2FF9dae6C504C9dEe84151F844a591);
    IERC20Upgradeable public constant LP3_VOUCHER = IERC20Upgradeable(0xcA00F8eef4cE1F9183E06fA25fE7872fEDcf7456);

    uint256 public constant DAO_TOKENS_IN_LP1 = 2250;
    uint256 public constant DAO_TOKENS_IN_LP2 = 9250e14;
    uint256 public constant DAO_TOKENS_IN_LP3 = 45;

    ICOREDAO public coreDAO;

    event Payment(address toWho, address whatToken, uint256 howMuch, string note);

    function initialize(ICOREDAO _coreDAO) public initializer {
        __Ownable_init();
        coreDAO = _coreDAO;
    }

    receive() external payable {}

    function pay(
        address payable who,
        uint256 howManyTokens,
        IERC20Upgradeable token,
        string memory note
    ) external onlyOwner {
        if (token == IERC20Upgradeable(address(0))) {
            (bool ok, ) = who.call{value: howManyTokens}("");
            require(ok, "eth send not ok");
        } else {
            token.safeTransfer(who, howManyTokens);
        }

        emit Payment(who, address(token), howManyTokens, note);
    }

    function wrapVouchers() external {
        uint256 balanceLP1User = LP1_VOUCHER.balanceOf(msg.sender);
        uint256 balanceLP2User = LP2_VOUCHER.balanceOf(msg.sender);
        uint256 balanceLP3User = LP3_VOUCHER.balanceOf(msg.sender);
        uint256 mintAmount;

        if (balanceLP1User > 0) {
            LP1_VOUCHER.safeTransferFrom(
                msg.sender,
                address(0x000000000000000000000000000000000000dEaD),
                balanceLP1User
            );
            mintAmount = mintAmount + (balanceLP1User * DAO_TOKENS_IN_LP1);
        }

        if (balanceLP2User > 0) {
            LP2_VOUCHER.safeTransferFrom(
                msg.sender,
                address(0x000000000000000000000000000000000000dEaD),
                balanceLP2User
            );
            mintAmount = mintAmount + (balanceLP2User * DAO_TOKENS_IN_LP2);
        }

        if (balanceLP3User > 0) {
            LP3_VOUCHER.safeTransferFrom(
                msg.sender,
                address(0x000000000000000000000000000000000000dEaD),
                balanceLP3User
            );
            mintAmount = mintAmount + (balanceLP3User * DAO_TOKENS_IN_LP3);
        }

        require(mintAmount > 0, "No tokens to wrap");

        coreDAO.issue(mintAmount, msg.sender);
    }
}
