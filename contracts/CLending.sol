// SPDX-License-Identifier: UNLICENSED

pragma solidity =0.8.6;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./CLendingLibrary.sol";
import "./types/CLendingTypes.sol";
import "./CLendingEventEmitter.sol";

/**
 * @title Lending contract for CORE and CoreDAO
 * @author CVault Finance
 */
contract CLending is OwnableUpgradeable, cLendingEventEmitter {
    using CLendingLibrary for IERC20;

    IERC20 public constant DAI = IERC20(0x6B175474E89094C44Da98b954EedeAC495271d0F);
    IERC20 public constant CORE_TOKEN = IERC20(0x62359Ed7505Efc61FF1D56fEF82158CcaffA23D7);
    address private constant DEADBEEF = 0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF;

    mapping(address => DebtorSummary) public debtorSummary;
    mapping(address => uint256) public collaterabilityOfToken;
    mapping(address => uint256) public userCollateralValue;
    mapping(address => address) public liquidationBeneficiaryOfToken;
    mapping(address => bool) public tokenRetired; // Since the whitelist is based on collaterability of token
    // We cannot retire it by setting it to 0 hence this mapping was added

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
        uint256 _loanDefaultThresholdPercent,
        uint256 _coreTokenCollaterability
    ) public initializer {
        __Ownable_init();

        coreDAOTreasury = _coreDAOTreasury;

        changeLoanTerms(_yearlyPercentInterest, _loanDefaultThresholdPercent);

        require(loanDefaultThresholdPercent > 100, "WOULD_LIQUIDATE");

        addNewToken(address(_daoToken), DEADBEEF, 1, 18);
        addNewToken(address(CORE_TOKEN), DEADBEEF, _coreTokenCollaterability, 18);
        addNewToken(address(DAI), _coreDAOTreasury, 1, 18); // DAI should never be liquidated but this is just in case

        coreDAO = _daoToken;
    }

    receive() external payable {
        revert("ETH_NOT_ACCEPTED");
    }

    // It should be noted that this will change everything backwards in time meaning some people might be liquidated right away
    function changeLoanTerms(uint256 _yearlyPercentInterest, uint256 _loanDefaultThresholdPercent) public onlyOwner {
        require(_loanDefaultThresholdPercent > 100, "WOULD_LIQUIDATE");

        emit LoanTermsChanged(
            yearlyPercentInterest,
            _yearlyPercentInterest,
            loanDefaultThresholdPercent,
            _loanDefaultThresholdPercent,
            block.timestamp,
            msg.sender
        );

        yearlyPercentInterest = _yearlyPercentInterest;
        loanDefaultThresholdPercent = _loanDefaultThresholdPercent;
    }

    // TODO add market supported check so can retire tokens to 0
    function editTokenCollaterability(address token, uint256 newCollaterability) external onlyOwner {
        emit TokenCollaterabilityChanged(
            token,
            collaterabilityOfToken[token],
            newCollaterability,
            block.timestamp,
            msg.sender
        );
        require(liquidationBeneficiaryOfToken[token] != address(0), "NOT_ADDED");
        if (newCollaterability == 0) {
            tokenRetired[token] = true;
        } else {
            collaterabilityOfToken[token] = newCollaterability;
            tokenRetired[token] = false;
        }
    }

    // warning this does not support different amount than 18 decimals
    function addNewToken(
        address token,
        address liquidationBeneficiary,
        uint256 collaterabilityInDAI,
        uint256 decimals
    ) public onlyOwner {
        /// 1e18 CORE = 5,500 e18 DAI
        /// 1units CORE = 5,500units DAI
        // $1DAI = 1e18 units

        /// wBTC = 1e8
        /// collaterability of wbtc  40,000e10
        /// totalCollaterability = how much UNITS of DAI one UNIT of this token is worth
        // Collapse = worth less than 1 dai per unit ( 1e18 token is worth less than $1 or token has higher decimals than than 1e18)
        require(decimals == 18, "UNSUPPORTED_DECIMALS");
        require(
            collaterabilityOfToken[token] == 0 && liquidationBeneficiaryOfToken[token] == address(0),
            "ALREADY_ADDED"
        );
        if (liquidationBeneficiary == address(0)) {
            liquidationBeneficiary = DEADBEEF;
        } // covers not send to 0 tokens
        require(collaterabilityInDAI > 0, "INVALID_COLLATERABILITY");
        emit NewTokenAdded(token, collaterabilityInDAI, liquidationBeneficiary, block.timestamp, msg.sender);
        liquidationBeneficiaryOfToken[token] = liquidationBeneficiary;
        collaterabilityOfToken[token] = collaterabilityInDAI;
    }

    function editTokenLiquidationBeneficiary(address token, address newBeneficiary) public onlyOwner {
        // Since beneficiary defaults to deadbeef it cannot be 0 if its been added before
        require(liquidationBeneficiaryOfToken[token] != address(0), "NOT_ADDED");
        require(token != address(CORE_TOKEN) && token != address(coreDAO), "CANNOT_MODIFY"); // Those should stay burned or floor doesnt hold
        if (newBeneficiary == address(0)) {
            newBeneficiary = DEADBEEF;
        } // covers not send to 0 tokens
        emit TokenLiquidationBeneficiaryChanged(
            token,
            liquidationBeneficiaryOfToken[token],
            newBeneficiary,
            block.timestamp,
            msg.sender
        );
        liquidationBeneficiaryOfToken[token] = newBeneficiary;
    }

    // Repays the loan supplying collateral and not adding it
    function repayLoan(IERC20 token, uint256 amount) public {
        DebtorSummary storage userSummaryStorage = debtorSummary[msg.sender];
        (uint256 totalDebt, ) = liquidateDelinquent(msg.sender);
        require(totalDebt > 0, "NOT_DEBT");

        uint256 tokenCollateralAbility = collaterabilityOfToken[address(token)];
        uint256 offeredCollateralValue = amount * tokenCollateralAbility;
        require(offeredCollateralValue > 0, "NOT_ENOUGH_COLLATERAL_OFFERED"); // covers both cases its a not supported token and 0 case
        require(tokenRetired[address(token)] == false, "TOKEN_RETIRED");

        uint256 _accruedInterest = accruedInterest(msg.sender);
        require(offeredCollateralValue >= _accruedInterest, "INSUFFICIENT_AMOUNT"); // Has to be done because we have to update debt time
        // Note that acured interest is never bigger than 10% of supplied collateral because of liquidateDelinquent call above
        if (offeredCollateralValue > totalDebt) {
            amount = quantityOfTokenForValueInDAI(totalDebt, tokenCollateralAbility);
            userSummaryStorage.amountDAIBorrowed = 0;
            // Updating debt time is not nessesary since accrued interest on 0 will always be 0
        } else {
            userSummaryStorage.amountDAIBorrowed -= offeredCollateralValue - _accruedInterest;
            // Send the repayment amt
        }
        _wipeInterestOwed(userSummaryStorage);
        require(amount > 0, "REPAYMENT_NOT_SUCESSFUL");

        token.safeTransferFrom(msg.sender, amount); // amount is changed if user supplies more than is neesesry to wipe their debt and interest
        emit Repayment(address(token), amount, block.timestamp, msg.sender);
        emit InterestPaid(address(token), _accruedInterest, block.timestamp, msg.sender);

        uint256 amountTokensForInterestRepayment = quantityOfTokenForValueInDAI(
            _accruedInterest,
            tokenCollateralAbility
        );
        if (amountTokensForInterestRepayment > 0) {
            _safeTransfer(address(token), coreDAOTreasury, amountTokensForInterestRepayment);
        }
    }

    function quantityOfTokenForValueInDAI(uint256 quantityOfDAI, uint256 tokenCollateralAbility)
        public
        pure
        returns (uint256)
    {
        require(tokenCollateralAbility > 0, "TOKEN_UNSUPPORTED");
        return quantityOfDAI / tokenCollateralAbility;
    }

    function _supplyCollateral(
        DebtorSummary storage userSummaryStorage,
        address user,
        IERC20 token,
        uint256 amount
    ) private {
        // Clear previous borrows & collateral for this user if they are delinquent
        liquidateDelinquent(user);

        require(token != DAI, "DAI_IS_ONLY_FOR_REPAYMENT");

        uint256 tokenCollateralAbility = collaterabilityOfToken[address(token)]; // essentially a whitelist
        require(tokenRetired[address(token)] == false, "TOKEN_RETIRED");

        require(tokenCollateralAbility != 0, "NOT_ACCEPTED");

        token.safeTransferFrom(user, amount);

        uint256 accruedInterests = accruedInterest(user);
        // We pay interest already accrued with the same mechanism as repay fn
        uint256 accruedInterestInToken = quantityOfTokenForValueInDAI(accruedInterests, tokenCollateralAbility); // eg. 6000 accrued interest and 1 CORE == 1

        // We add collateral into the user struct
        uint256 collateralIndex;
        (userCollateralValue[user], collateralIndex) = _upsertCollateralInUserSummary(
            userSummaryStorage,
            token,
            amount
        );

        if (accruedInterestInToken > 0) {
            require(
                userSummaryStorage.collateral[collateralIndex].amountCollateral >= accruedInterestInToken,
                "INSUFFICIENT_AMOUNT"
            );
            userSummaryStorage.collateral[collateralIndex].amountCollateral -= accruedInterestInToken;
            userCollateralValue[user] -= accruedInterests;

            _safeTransfer(address(token), coreDAOTreasury, accruedInterestInToken);
            _wipeInterestOwed(userSummaryStorage); // wipes accrued interests

            emit InterestPaid(address(token), accruedInterests, block.timestamp, user);
        }

        emit CollateralAdded(address(token), amount, block.timestamp, msg.sender);
    }

    function addCollateral(IERC20 token, uint256 amount) external {
        DebtorSummary storage userSummaryStorage = debtorSummary[msg.sender];
        _supplyCollateral(userSummaryStorage, msg.sender, token, amount);
    }

    function addCollateralAndBorrow(
        IERC20 tokenCollateral,
        uint256 amountCollateral,
        uint256 amountBorrow
    ) external {
        DebtorSummary storage userSummaryStorage = debtorSummary[msg.sender];
        _supplyCollateral(userSummaryStorage, msg.sender, tokenCollateral, amountCollateral);
        _borrow(userSummaryStorage, msg.sender, amountBorrow);
    }

    function borrow(uint256 amount) public {
        DebtorSummary storage userSummaryStorage = debtorSummary[msg.sender];
        _borrow(userSummaryStorage, msg.sender, amount);
    }

    // Repays all users accumulated interest with margin
    // Then checks if borrow can be preformed, adds it to total borrowed as well as transfers the dai to user
    function _borrow(
        DebtorSummary storage userSummaryStorage,
        address user,
        uint256 amountBorrow
    ) private {
        // We take users accrued interest and the amount borrowed
        // We repay the accured interest from the loan amount, by adding it on top of the loan amount
        uint256 totalCollateral = userCollateralValue[user]; // Value of collateral in DAI
        uint256 userAccruedInterest = accruedInterest(user); // Interest in DAI
        uint256 totalAmountBorrowed = userSummaryStorage.amountDAIBorrowed;
        uint256 totalDebt = userAccruedInterest + totalAmountBorrowed;

        require(amountBorrow > 0, "NO_BORROW"); // This is intentional after adding accured interest
        require(totalDebt <= totalCollateral, "OVER_DEBTED");

        uint256 userRemainingCollateral = totalCollateral - totalDebt; // User's collateral before making this loan
        // If the amount borrow is higher than remaining collateral, cap it
        if (amountBorrow > userRemainingCollateral) {
            amountBorrow = userRemainingCollateral;
        }

        userSummaryStorage.amountDAIBorrowed += amountBorrow;
        _wipeInterestOwed(userSummaryStorage); // because we added it to their borrowed amount

        // set interests from previous loan separately
        userSummaryStorage.pendingInterests = userAccruedInterest;

        DAI.transfer(user, amountBorrow); // DAI transfer function doesnt need safe transfer
        emit LoanTaken(amountBorrow, block.timestamp, user);
    }

    function _upsertCollateralInUserSummary(
        DebtorSummary storage userSummaryStorage,
        IERC20 token,
        uint256 amount
    ) private returns (uint256 collateralValue, uint256 collateralIndex) {
        // Insert or update operation
        require(amount != 0, "INVALID_AMOUNT");
        bool collateralAdded;

        // Loops over all provided collateral, checks if its there and if it is edit it
        for (uint256 i = 0; i < userSummaryStorage.collateral.length; i++) {
            Collateral storage collateral = userSummaryStorage.collateral[i];

            if (collateral.collateralAddress == address(token)) {
                collateral.amountCollateral += amount;
                collateralIndex = i;
                collateralAdded = true;
            }

            // Recalculate the user collateral value for unretired tokens.
            if (!tokenRetired[collateral.collateralAddress]) {
                collateralValue += collateral.amountCollateral * collaterabilityOfToken[collateral.collateralAddress];
            }
        }

        // If it has not been already supplied we push it on
        if (!collateralAdded) {
            collateralIndex = userSummaryStorage.collateral.length;
            userSummaryStorage.collateral.push(
                Collateral({collateralAddress: address(token), amountCollateral: amount})
            );

            collateralValue += amount * collaterabilityOfToken[address(token)];
        }
    }

    function _isLiquidable(uint256 totalDebt, uint256 totalCollateral) private view returns (bool) {
        return totalDebt > (totalCollateral * loanDefaultThresholdPercent) / 100;
    }

    // Liquidates people in default
    function liquidateDelinquent(address user) public returns (uint256 totalDebt, uint256 totalCollateral) {
        totalDebt = userTotalDebt(user); // This is with interest
        totalCollateral = userCollateralValue[user];

        if (_isLiquidable(totalDebt, totalCollateral)) {
            // user is in default, wipe their debt and collateral
            _liquidate(user);
            emit Liquidation(user, totalCollateral, block.timestamp, msg.sender);
            return (0, 0);
        }
    }

    function _liquidate(address user) private {
        for (uint256 i = 0; i < debtorSummary[user].collateral.length; i++) {
            uint256 amount = debtorSummary[user].collateral[i].amountCollateral;
            address currentCollateralAddress = debtorSummary[user].collateral[i].collateralAddress;

            if (
                msg.sender == user || // User liquidates himself no incentive.
                currentCollateralAddress == address(coreDAO) || // no incentive for coreDAO to maintain floor, burned anyway
                currentCollateralAddress == address(CORE_TOKEN)
            ) {
                // no incentive for core to maintain floor, and its burned anyway
                _safeTransfer(
                    currentCollateralAddress, //token
                    liquidationBeneficiaryOfToken[currentCollateralAddress], // to
                    amount //amount
                );
            } else {
                // Someone else liquidates user 0.5% incentive (1/200)
                _safeTransfer(
                    currentCollateralAddress, //token
                    liquidationBeneficiaryOfToken[currentCollateralAddress], // to
                    (amount * 199) / 200 //amount 99.5%
                );
                _safeTransfer(
                    currentCollateralAddress, //token
                    msg.sender, // to
                    amount / 200 //amount 0.5%
                );
            }
        }

        // remove all collateral, debt and collateral value cache
        delete userCollateralValue[user];
        delete debtorSummary[user];
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

    function reclaimAllCollateral() external {
        (uint256 totalDebt, uint256 totalCollateral) = liquidateDelinquent(msg.sender);

        require(totalCollateral > 0, "NOTHING_TO_CLAIM");
        require(totalDebt == 0, "STILL_IN_DEBT");

        for (uint256 i = 0; i < debtorSummary[msg.sender].collateral.length; i++) {
            address collateralAddress = debtorSummary[msg.sender].collateral[i].collateralAddress;
            uint256 amount = debtorSummary[msg.sender].collateral[i].amountCollateral;
            _safeTransfer(
                collateralAddress, //token
                msg.sender, // to
                amount //amount
            );
            emit CollateralReclaimed(collateralAddress, amount, block.timestamp, msg.sender);
        }

        // User doesnt have collateral anymore and paid off debt, bye
        delete userCollateralValue[msg.sender];
        delete debtorSummary[msg.sender];
    }

    function userCollaterals(address user) public view returns (Collateral[] memory) {
        return debtorSummary[user].collateral;
    }

    function userTotalDebt(address user) public view returns (uint256) {
        return accruedInterest(user) + debtorSummary[user].amountDAIBorrowed;
    }

    function accruedInterest(address user) public view returns (uint256) {
        DebtorSummary memory userSummaryMemory = debtorSummary[user];
        uint256 timeSinceLastLoan = block.timestamp - userSummaryMemory.timeLastBorrow;

        // 365days * 100
        return
            ((userSummaryMemory.amountDAIBorrowed * yearlyPercentInterest * timeSinceLastLoan) / 365_00 days) +
            userSummaryMemory.pendingInterests;
    }

    function _wipeInterestOwed(DebtorSummary storage userSummaryStorage) private {
        userSummaryStorage.timeLastBorrow = block.timestamp;
        userSummaryStorage.pendingInterests = 0; // clear user pending interests
    }
}
