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
    // TODO : check addresses for 100% accuracy
    IERC20 public constant LP1_VOUCHER = IERC20(0xF6Dd68031a22c8A3F1e7a424cE8F43a1e1A3be3E);
    IERC20 public constant LP2_VOUCHER = IERC20(0xb8ee07B5ED2FF9dae6C504C9dEe84151F844a591);
    IERC20 public constant LP3_VOUCHER = IERC20(0xcA00F8eef4cE1F9183E06fA25fE7872fEDcf7456);
    address private constant DEADBEEF = 0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF;

    // TODO : check numbers for accuracy and conduct number tests

    uint256 public constant DAO_TOKENS_IN_LP1 = 2350;
    uint256 public constant DAO_TOKENS_IN_LP2 = 9250e5;
    uint256 public constant DAO_TOKENS_IN_LP3 = 45;

    ICOREDAO public coreDAO;

    event Payment(address toWho, address whatToken, uint256 howMuch, string note);

    function initialize(ICOREDAO _coreDAO) public initializer {
        __Ownable_init();
        coreDAO = _coreDAO;
    }
    
    // Allow contract to get ETH since we have a pay() function that lets ETH not get stuck
    receive() external payable {}

    // Governor (owner contract) pays a community member with ETH or a token inside the treasury
    // ETH can be transfered with supplying 0x0 for "token"
    function pay(
        IERC20 token,
        address payable who,
        uint256 howManyTokens,
        string memory note
    ) public onlyOwner {
        // Flag ETH transfer
        if (token == IERC20(address(0))) {
            (bool ok, ) = who.call{value: howManyTokens}("");
            require(ok, "PAYMENT_FAILED");
        // Normal token transfer
        } else {
            // we dont check any returns cause it can be recalled
            _safeTransfer(address(token), who, howManyTokens);
        }

        emit Payment(who, address(token), howManyTokens, note);
    }

    // No user supplied functions
    function wrapVouchers() public {
        // We check balances of all LP vouchers
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

        // No-0 check
        require(mintAmount > 0, "NOTHING_TO_WRAP");

        // Absolutely redundant checks
        // This function is just going to be called once per user so its not that important to be gas efficient
        require(LP1_VOUCHER.balanceOf(msg.sender) == 0, "!!");
        require(LP2_VOUCHER.balanceOf(msg.sender) == 0, "!!");
        require(LP3_VOUCHER.balanceOf(msg.sender) == 0, "!!");

        // Simple permissioned wrapper over the coreDAO token mint function
        coreDAO.issue(msg.sender, mintAmount);
    }

    function _safeTransfer(
        address token,
        address to,
        uint256 value
    ) private {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(bytes4(keccak256(bytes("transfer(address,uint256)"))), to, value)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "TRANSFER_FAILED");
    }
}
