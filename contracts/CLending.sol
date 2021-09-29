// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "./CLendingLibrary.sol";
import "./types/CLendingTypes.sol";

/**
 * @title Lending contract for CORE and CoreDAO
 * @author CVault Finance
 */
contract CLending is OwnableUpgradeable {
    using CLendingLibrary for IERC20;

    IERC20 public constant DAI = IERC20(0x6B175474E89094C44Da98b954EedeAC495271d0F);
    IERC20 public constant CORE_TOKEN = IERC20(0x62359Ed7505Efc61FF1D56fEF82158CcaffA23D7);
    address private constant DEADBEEF = 0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF;

    mapping(address => DebtorSummary) public debtorSummary;
    mapping(address => uint256) public collaterabilityOfToken;
    mapping(address => address) public liquidationBeneficiaryOfToken;

    address public coreDAOTreasury;
    uint256 public yearlyPercentInterest;
    uint256 public loanDefaultThresholdPercent;
    IERC20 public coreDAO; // initialized hence not immutable but should be


    /// @dev upfront storage allocation for further upgrades
    uint256[52] private _____gap;

    function initialize(
        address _coreDAOTreasury,
        IERC20 _daoToken,
        uint256 _yearlyPercentInterest,
        uint256 _loanDefaultThresholdPercent
    ) public initializer {
        __Ownable_init();

        coreDAOTreasury = _coreDAOTreasury;
        yearlyPercentInterest = _yearlyPercentInterest;
        loanDefaultThresholdPercent = _loanDefaultThresholdPercent;

        collaterabilityOfToken[address(CORE_TOKEN)] = 5500;
        collaterabilityOfToken[address(_daoToken)] = 1;
        liquidationBeneficiaryOfToken[address(CORE_TOKEN)] = DEADBEEF;
        liquidationBeneficiaryOfToken[address(_daoToken)] = DEADBEEF;
        coreDAO = _daoToken;
    }

    receive() external payable {
        revert("CLending: ETH_NOT_ACCEPTED");
    }

    // It should be noted that this will change everything backwards in time meaning some people might be liquidated right away
    function changeLoanTerms(uint256 _yearlyPercentInterest, uint256 _loanDefaultThresholdPercent) public onlyOwner {
        yearlyPercentInterest = _yearlyPercentInterest;
        loanDefaultThresholdPercent = _loanDefaultThresholdPercent;
    }

    function editTokenCollaterability(address token, uint256 newCollaterability) public onlyOwner {
        require(liquidationBeneficiaryOfToken[token] != address(0), "Token not added");
        collaterabilityOfToken[token] = newCollaterability;
    }

    function addNewToken(address token, address liquidationBeneficiary, uint256 collaterabilityInUSD) public onlyOwner {
        require(collaterabilityOfToken[token] == 0 && liquidationBeneficiaryOfToken[token] == address(0), "Token already added");
        if(liquidationBeneficiary == address(0)) { liquidationBeneficiary=DEADBEEF; } // covers not send to 0 tokens
        liquidationBeneficiaryOfToken[token] = liquidationBeneficiary;
        collaterabilityOfToken[token] = collaterabilityInUSD;
    }

    function editTokenLiquiationBeneficiary(address token, address newBeneficiary) public onlyOwner {
        // Since beneficiary defaults to deadbeef it cannot be 0 if its been added before
        require(liquidationBeneficiaryOfToken[token] != address(0), "token not added");
        require(token != address(CORE_TOKEN) && token != address(coreDAO)); // Those should stay burned or floor doesnt hold
        if(newBeneficiary == address(0)) { newBeneficiary=DEADBEEF; } // covers not send to 0 tokens
        liquidationBeneficiaryOfToken[token] = newBeneficiary;
    }
    // Repays the loan supplying collateral and not adding it
    function repayLoan(IERC20 token, uint256 amount) public {
        DebtorSummary storage userSummaryStorage = debtorSummary[msg.sender];
        (uint256 totalDebt, ) = liquidateDeliquent(msg.sender);
        require(totalDebt > 0, "CLending: NOT_DEBT");

        uint256 tokenCollateralAbility = collaterabilityOfToken[address(token)];
        uint256 offeredCollateralValue = amount * tokenCollateralAbility;
        require(offeredCollateralValue > 0, "CLending: NOT_ENOUGH_COLLATERAL_OFFERED"); // covers both cases its a not supported token and 0 case

        uint256 _accruedInterest = accruedInterest(msg.sender);
        require(offeredCollateralValue > _accruedInterest, "CLending: INSUFFICIENT_AMOUNT"); // Has to be done because we have to update debt time
        // Note that acured interest is never bigger than 10% of supplied collateral because of liquidateDeliquent call above
        if (offeredCollateralValue > totalDebt) {
            amount = totalDebt / tokenCollateralAbility;
            userSummaryStorage.amountDAIBorrowed = 0;
            // Updating debt time is not nessesary since accrued interest on 0 will always be 0
        } else {
            userSummaryStorage.amountDAIBorrowed =
                userSummaryStorage.amountDAIBorrowed -
                (offeredCollateralValue -_accruedInterest); // Brackets is important as their collateral is garnished by accrued interest repayment
            // Send the repayment amt
            updateDebtTime(userSummaryStorage);
        }

        token.safeTransferFrom(msg.sender, amount);

        // Send the accrued interest back to the DAO
        safeTransfer(address(token), coreDAOTreasury, _accruedInterest / tokenCollateralAbility);
    }

    function _supplyCollateral(
        DebtorSummary storage userSummaryStorage,
        address user,
        IERC20 token,
        uint256 amount
    ) private {
        liquidateDeliquent(user);

        require(token != DAI, "CLending: NOT_DAI");

        uint256 tokenCollateralAbility = collaterabilityOfToken[address(token)];
        require(tokenCollateralAbility != 0, "CLending: NOT_ACCEPTED");

        token.safeTransferFrom(user, amount);

        // We pay interest already accrued with the same mechanism as repay fn
        uint256 accruedInterestInToken = accruedInterest(user) / tokenCollateralAbility;

        require(accruedInterestInToken <= amount, "CLending: INSUFFICIENT_AMOUNT");
        amount = amount - accruedInterestInToken;
        safeTransfer(address(token), coreDAOTreasury, accruedInterestInToken);

        // We add collateral into the user struct
        _addCollateral(userSummaryStorage, token, amount);
    }

    function addCollateral(IERC20 token, uint256 amount) public {
        DebtorSummary storage userSummaryStorage = debtorSummary[msg.sender];
        _supplyCollateral(userSummaryStorage, msg.sender, token, amount);
        updateDebtTime(userSummaryStorage);
    }

    function addCollateralAndBorrow(
        IERC20 tokenCollateral,
        uint256 amountCollateral,
        uint256 amountBorrow
    ) public {
        DebtorSummary storage userSummaryStorage = debtorSummary[msg.sender];
        _supplyCollateral(userSummaryStorage, msg.sender, tokenCollateral, amountCollateral);
        _borrow(userSummaryStorage, msg.sender, amountBorrow);
    }

    function borrow(uint256 amount) public {
        DebtorSummary storage userSummaryStorage = debtorSummary[msg.sender];
        _borrow(userSummaryStorage, msg.sender, amount);
    }


    // Lets users repay interest with their remaining collateral
    function repayInterestWithRemainingMargin() public {
        _repayInterestWithRemainingMargin(
            debtorSummary[msg.sender],
            accruedInterest(msg.sender),
            userCollateralValue(msg.sender)
        );
    }

    // Takes remaining collateral users have and repays their accured interest with it and then updates new amount borrowed
    function _repayInterestWithRemainingMargin(
        DebtorSummary storage userSummaryStorage, 
        uint256 accruedInterest,
        uint256 totalCollateral) private returns(uint256) {
        uint256 daiBorrowed = userSummaryStorage.amountDAIBorrowed;
        if(accruedInterest == 0) { return daiBorrowed; } // No interest so we don't need to repay
        uint256 newTotalDebt = daiBorrowed + accruedInterest;

        require(totalCollateral > newTotalDebt, "CLending: CANNOT_REPAY_INTEREST");
        addToAmountBorrowed(userSummaryStorage, accruedInterest);

        return newTotalDebt;
    }

    function _borrow(
        DebtorSummary storage userSummaryStorage,
        address user,
        uint256 amountBorrow
    ) private {
        uint256 totalCollateral = userCollateralValue(user);
        uint256 totalDebt = _repayInterestWithRemainingMargin( 
                                    userSummaryStorage,
                                    accruedInterest(user),
                                    totalCollateral);  // This fn doesnt change totalcollateral
        // hence forth accrued inteterest is always 0

        require(amountBorrow > 0, "Borrow something");
        require(totalDebt <= totalCollateral && !isLiquidable(totalDebt, totalCollateral), "CLending: OVER_DEBTED");

        uint256 userRemainingCollateral = totalCollateral - totalDebt;
        if (amountBorrow > userRemainingCollateral) {
            uint256 totalBorrowed = totalDebt + amountBorrow;
            require(totalBorrowed <= totalCollateral, "CLending: TOO_MUCH_BORROWED");
            amountBorrow = totalCollateral - totalBorrowed;
        }

        addToAmountBorrowed(userSummaryStorage, amountBorrow);
        DAI.transfer(user, amountBorrow); // DAI transfer function doesnt need safe transfer
    }

    function _addCollateral(
        DebtorSummary storage userSummaryStorage,
        IERC20 token,
        uint256 amount
    ) private {

        require(amount != 0, "Supply collateral");
        bool alreadySupplied;
        // Loops over all provided collateral, checks if its there and if it is edit it
        for (uint256 i = 0; i < userSummaryStorage.collateral.length; i++) {
            if (userSummaryStorage.collateral[i].collateralAddress == address(token)) {
                userSummaryStorage.collateral[i].suppliedCollateral =
                    userSummaryStorage.collateral[i].suppliedCollateral +
                    amount;
                alreadySupplied = true;
                break;
            }
        }

        // If it has not been already supplied we push it on
        if (!alreadySupplied) {
            userSummaryStorage.collateral.push(
                Collateral({collateralAddress: address(token), suppliedCollateral: amount})
            );
        }
    }

    function isLiquidable(uint256 totalDebt, uint256 totalCollateral) private view returns (bool) {
        return (totalDebt * loanDefaultThresholdPercent) / 100 > totalCollateral;
    }

    // Liquidates people in default
    function liquidateDeliquent(address user) public returns (uint256 totalDebt, uint256 totalCollateral) {
        totalDebt = userTotalDebt(user); // This is with interest
        totalCollateral = userCollateralValue(user);

        if (isLiquidable(totalDebt, totalCollateral)) {
            // user is in default, wipe their debt and collateral
            liquidate(user);
            return (0, 0);
        }
    }

    function liquidate(address user) private {

        for (uint256 i = 0; i < debtorSummary[user].collateral.length; i++) {
            uint256 supplied = debtorSummary[user].collateral[i].suppliedCollateral;
            address currentCollateralAddress = debtorSummary[user].collateral[i].collateralAddress;

            if(msg.sender == user ||// User liquidates himself no incentive.
               currentCollateralAddress == address(coreDAO) || // no incentive for coreDAO to maintain floor, burned anyway
               currentCollateralAddress == address(CORE_TOKEN)) { // no incentive for core to maintain floor, and its burned anyway
                safeTransfer(
                    currentCollateralAddress, //token
                    liquidationBeneficiaryOfToken[currentCollateralAddress], // to
                    supplied //amount
                );
            } else { // Someone else liquidates user 0.5% incentive (1/200)
                safeTransfer(
                    currentCollateralAddress, //token
                    liquidationBeneficiaryOfToken[currentCollateralAddress], // to
                    supplied * 199 / 200 //amount
                );
                safeTransfer(
                    currentCollateralAddress, //token
                    msg.sender, // to
                    supplied / 200 //amount
                );
            }


        }

        delete debtorSummary[user];

    }

    function safeTransfer(address token, address to, uint value) private {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(bytes4(keccak256(bytes('transfer(address,uint256)'))), to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), 'UniswapV2: TRANSFER_FAILED');
    }

    function reclaimAllCollateral() public {
        (uint256 totalDebt, uint256 totalCollateral) = liquidateDeliquent(msg.sender);

        require(totalCollateral > 0, "CLending: NOTHING_TO_CLAIM");
        require(totalDebt == 0, "CLending: STILL_IN_DEBT");

        for (uint256 i = 0; i < debtorSummary[msg.sender].collateral.length; i++) {
            safeTransfer(
                    debtorSummary[msg.sender].collateral[i].collateralAddress, //token
                    msg.sender, // to
                    debtorSummary[msg.sender].collateral[i].suppliedCollateral //amount
            );
        }

        // User doesnt have collateral anymore and paid off debt, bye
        delete debtorSummary[msg.sender];
    }

    function userCollateralValue(address user) public view returns (uint256 collateral) {
        Collateral[] memory userCollateralTokens = debtorSummary[user].collateral;

        for (uint256 i = 0; i < userCollateralTokens.length; i++) {
            Collateral memory currentToken = userCollateralTokens[i];
            uint256 tokenDebit = collaterabilityOfToken[currentToken.collateralAddress] *
                currentToken.suppliedCollateral;
            collateral = collateral + tokenDebit;
        }
    }

    function userTotalDebt(address user) public view returns (uint256) {
        return accruedInterest(user) + debtorSummary[user].amountDAIBorrowed;
    }

    function accruedInterest(address user) public view returns (uint256) {
        DebtorSummary memory userSummaryMemory = debtorSummary[user];
        uint256 timeSinceLastLoan = block.timestamp - userSummaryMemory.timeLastBorrow;
        return (userSummaryMemory.amountDAIBorrowed * yearlyPercentInterest * timeSinceLastLoan) / 365_00 days; // 365days * 100
    }

    function addToAmountBorrowed(DebtorSummary storage userSummaryStorage, uint256 addToBorrowed) private {
        userSummaryStorage.amountDAIBorrowed = userSummaryStorage.amountDAIBorrowed + addToBorrowed;
        updateDebtTime(userSummaryStorage);
    }

    function updateDebtTime(DebtorSummary storage userSummaryStorage) private {
        userSummaryStorage.timeLastBorrow = block.timestamp;
    }
}
