// SPDX-License-Identifier: UNLICENSED

pragma solidity =0.8.6;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ICOREDAO {
    function issue(address, uint256) external;
}

/**
 * @title Protocol treasury contract
 * @author CVault Finance
 */
contract CoreDAOTreasury is OwnableUpgradeable {
    IERC20 public constant LP1_VOUCHER = IERC20(0xF6Dd68031a22c8A3F1e7a424cE8F43a1e1A3be3E);
    IERC20 public constant LP2_VOUCHER = IERC20(0xb8ee07B5ED2FF9dae6C504C9dEe84151F844a591);
    IERC20 public constant LP3_VOUCHER = IERC20(0xcA00F8eef4cE1F9183E06fA25fE7872fEDcf7456);
    address private constant DEADBEEF = 0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF;

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
        IERC20 token,
        address payable who,
        uint256 howManyTokens,
        string memory note
    ) public onlyOwner {
        if (token == IERC20(address(0))) {
            (bool ok, ) = who.call{value: howManyTokens}("");
            require(ok, "PAYMENT_FAILED");
        } else {
            token.transfer(who, howManyTokens);
        }

        emit Payment(who, address(token), howManyTokens, note);
    }

    function wrapVouchers() public {
        uint256 balanceLP1User = LP1_VOUCHER.balanceOf(msg.sender);
        uint256 balanceLP2User = LP2_VOUCHER.balanceOf(msg.sender);
        uint256 balanceLP3User = LP3_VOUCHER.balanceOf(msg.sender);
        uint256 mintAmount;

        if (balanceLP1User > 0) {
            LP1_VOUCHER.transferFrom(msg.sender, DEADBEEF, balanceLP1User);
            mintAmount = mintAmount + (balanceLP1User * DAO_TOKENS_IN_LP1);
        }

        if (balanceLP2User > 0) {
            LP2_VOUCHER.transferFrom(msg.sender, DEADBEEF, balanceLP2User);
            mintAmount = mintAmount + (balanceLP2User * DAO_TOKENS_IN_LP2);
        }

        if (balanceLP3User > 0) {
            LP3_VOUCHER.transferFrom(msg.sender, DEADBEEF, balanceLP3User);
            mintAmount = mintAmount + (balanceLP3User * DAO_TOKENS_IN_LP3);
        }

        require(mintAmount > 0, "NOTHING_TO_WRAP");

        coreDAO.issue(msg.sender, mintAmount);
    }
}
