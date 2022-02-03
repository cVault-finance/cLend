// SPDX-License-Identifier: UNLICENSED

pragma solidity =0.8.6;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./CLendingLibrary.sol";
import "./types/CLendingTypes.sol";
import "./CLendingEventEmitter.sol";
import "hardhat/console.sol";

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
    mapping(address => address) public liquidationBeneficiaryOfToken;
    mapping(address => bool) public isAngel;


    address public coreDAOTreasury;
    uint256 public yearlyPercentInterest;
    uint256 public loanDefaultThresholdPercent;
    IERC20 public coreDAO; // initialized hence not immutable but should be

    bool private entered;
    bool private holyIntervention;

    /// @dev upfront storage allocation for further upgrades
    uint256[52] private _____gap;

    modifier nonEntered {
        require(!entered, "NO_REENTRY");
        entered = true;
        _;
        entered = false;
    }

    modifier notHaram {
        require(!holyIntervention,"GOD_SAYS_NO");
        _;
    }

    function editAngels(address _angel, bool _isAngel) external onlyOwner {
        isAngel[_angel] = _isAngel;
    }

    function intervenienteHomine() external {
        require(isAngel[msg.sender] || msg.sender == owner(),"HERETICAL");
        holyIntervention = true;
    }

    function godIsDead() external onlyOwner {
        holyIntervention = false;
    }

    function initialize(
        address _coreDAOTreasury,
        IERC20 _daoToken,
        uint256 _yearlyPercentInterest,
        uint256 _loanDefaultThresholdPercent,
        uint256 _coreTokenCollaterability
    ) external initializer {
        require(msg.sender == 0x5A16552f59ea34E44ec81E58b3817833E9fD5436, "BUM");
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

    function editTokenCollaterability(address token, uint256 newCollaterability) external onlyOwner {
        emit TokenCollaterabilityChanged(
            token,
            collaterabilityOfToken[token],
            newCollaterability,
            block.timestamp,
            msg.sender
        );
        require(liquidationBeneficiaryOfToken[token] != address(0), "NOT_ADDED");
        collaterabilityOfToken[token] = newCollaterability;
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

    function editTokenLiquidationBeneficiary(address token, address newBeneficiary) external onlyOwner {
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
    // solcurity: C48
    function repayLoan(IERC20 token, uint256 amount) external notHaram nonEntered {
        console.log("repayLoan()");

        (uint256 totalDebt, ) = _liquidateDeliquent(msg.sender);
        DebtorSummary storage userSummaryStorage = debtorSummary[msg.sender];
        uint256 tokenCollateralAbility = collaterabilityOfToken[address(token)];
        uint256 offeredCollateralValue = amount * tokenCollateralAbility;
        uint256 _accruedInterest = accruedInterest(msg.sender);

        console.log("repayLoan | totalDebt", totalDebt);
        console.log("repayLoan | tokenCollateralAbility", tokenCollateralAbility);
        console.log("repayLoan | offeredCollateralValue", offeredCollateralValue);
        console.log("repayLoan | _accruedInterest", _accruedInterest);

        require(offeredCollateralValue > 0, "NOT_ENOUGH_COLLATERAL_OFFERED"); // covers both cases its a not supported token and 0 case
        require(totalDebt > 0, "NOT_DEBT");
        require(offeredCollateralValue >= _accruedInterest, "INSUFFICIENT_AMOUNT"); // Has to be done because we have to update debt time
        require(amount > 0, "REPAYMENT_NOT_SUCESSFUL");

        // Note that acured interest is never bigger than 10% of supplied collateral because of liquidateDelinquent call above
        if (offeredCollateralValue > totalDebt) {

            console.log("repayLoan | offeredCollateralValue > totalDebt");

            amount = quantityOfTokenForValueInDAI(totalDebt, tokenCollateralAbility);

            console.log("repayLoan | amount", amount);

            require(amount > 0, "REPAYMENT_NOT_SUCESSFUL");
            userSummaryStorage.amountDAIBorrowed = 0;

            console.log("repayLoan | userSummaryStorage.amountDAIBorrowed", userSummaryStorage.amountDAIBorrowed);

            // Updating debt time is not nessesary since accrued interest on 0 will always be 0
        } else {
            console.log("repayLoan | offeredCollateralValue", offeredCollateralValue);
            console.log("repayLoan | _accruedInterest", _accruedInterest);

            console.log("repayLoan | userSummaryStorage.amountDAIBorrowed BEFORE", userSummaryStorage.amountDAIBorrowed);
            userSummaryStorage.amountDAIBorrowed -= (offeredCollateralValue - _accruedInterest);
            console.log("repayLoan | userSummaryStorage.amountDAIBorrowed AFTER", userSummaryStorage.amountDAIBorrowed);



            // Send the repayment amt
        }
        
        // Nessesary to do it after the change of amount
        token.safeTransferFrom(msg.sender, amount); // amount is changed if user supplies more than is neesesry to wipe their debt and interest
        console.log("repayLoan | safeTransferFrom", address(token), msg.sender, amount);

        emit Repayment(address(token), amount, block.timestamp, msg.sender);

        // Interst handling
        // Interest is always repaid here because of the offeredCollateralValue >= _accruedInterest check
        uint256 amountTokensForInterestRepayment = quantityOfTokenForValueInDAI(
            _accruedInterest,
            tokenCollateralAbility
        );

        console.log("repayLoan | amountTokensForInterestRepayment", amountTokensForInterestRepayment);

        if (amountTokensForInterestRepayment > 0) {
            console.log("repayLoan | amountTokensForInterestRepayment > 0");

            _safeTransfer(address(token), coreDAOTreasury, amountTokensForInterestRepayment);
            console.log("repayLoan | _safeTransfer to treasury", address(token), amountTokensForInterestRepayment);

        }
        _wipeInterestOwed(userSummaryStorage);
        emit InterestPaid(address(token), _accruedInterest, block.timestamp, msg.sender);
    }

    function quantityOfTokenForValueInDAI(uint256 quantityOfDAI, uint256 tokenCollateralAbility)
        public
        pure
        returns (uint256)
    {
        require(tokenCollateralAbility > 0, "TOKEN_UNSUPPORTED");
        return quantityOfDAI / tokenCollateralAbility;
    }

    // solcurity: C48
    function _supplyCollateral(
        DebtorSummary storage userSummaryStorage,
        address user,
        IERC20 token,
        uint256 amount
    ) private nonEntered {
        console.log("");
        console.log("_supplyCollateral()");
        // Clear previous borrows & collateral for this user if they are delinquent
        _liquidateDeliquent(user);

        uint256 tokenCollateralAbility = collaterabilityOfToken[address(token)]; // essentially a whitelist

        console.log("_supplyCollateral | tokenCollateralAbility", tokenCollateralAbility);

        require(token != DAI, "DAI_IS_ONLY_FOR_REPAYMENT");
        require(tokenCollateralAbility != 0, "NOT_ACCEPTED");
        require(amount > 0, "!AMOUNT");
        require(user != address(0), "NO_ADDRESS");

        // Transfer the token from owner, important this is first because of interest repayment which can send
        token.safeTransferFrom(user, amount);

        console.log("_supplyCollateral | safeTransferFrom the collateral", address(token), user, amount);

        // We add collateral into the user struct
        _upsertCollateralInUserSummary(userSummaryStorage, token, amount);
        emit CollateralAdded(address(token), amount, block.timestamp, msg.sender);
        console.log("");
    }

    function addCollateral(IERC20 token, uint256 amount) external {
        DebtorSummary storage userSummaryStorage = debtorSummary[msg.sender];
        _supplyCollateral(userSummaryStorage, msg.sender, token, amount);
    }

    function addCollateralAndBorrow(
        IERC20 tokenCollateral,
        uint256 amountCollateral,
        uint256 amountBorrow
    ) external notHaram {
        console.log("addCollateralAndBorrow()");

        DebtorSummary storage userSummaryStorage = debtorSummary[msg.sender];
        _supplyCollateral(userSummaryStorage, msg.sender, tokenCollateral, amountCollateral);
        _borrow(userSummaryStorage, msg.sender, amountBorrow);
    }

    function borrow(uint256 amount) external notHaram {
        console.log("borrow()");

        DebtorSummary storage userSummaryStorage = debtorSummary[msg.sender];
        _borrow(userSummaryStorage, msg.sender, amount);
    }

    // Repays all users accumulated interest with margin
    // Then checks if borrow can be preformed, adds it to total borrowed as well as transfers the dai to user
    // solcurity: C48
    function _borrow(
        DebtorSummary storage userSummaryStorage,
        address user,
        uint256 amountBorrow
    ) private nonEntered {
        // We take users accrued interest and the amount borrowed
        // We repay the accured interest from the loan amount, by adding it on top of the loan amount
        uint256 totalCollateral = userCollateralValue(user); // Value of collateral in DAI
        uint256 userAccruedInterest = accruedInterest(user); // Interest in DAI
        uint256 totalAmountBorrowed = userSummaryStorage.amountDAIBorrowed;
        uint256 totalDebt = userAccruedInterest + totalAmountBorrowed;

        console.log("_borrow | totalCollateral", totalCollateral);
        console.log("_borrow | userAccruedInterest", userAccruedInterest);
        console.log("_borrow | totalAmountBorrowed", totalAmountBorrowed);
        console.log("_borrow | totalDebt", totalDebt);

        require(totalDebt < totalCollateral, "OVER_DEBTED");
        require(amountBorrow > 0, "NO_BORROW"); // This is intentional after adding accured interest
        require(user != address(0), "NO_ADDRESS");

        uint256 userRemainingCollateral = totalCollateral - totalDebt; // User's collateral before making this loan
        console.log("_borrow | userRemainingCollateral", userRemainingCollateral);

        // If the amount borrow is higher than remaining collateral, cap it
        if (amountBorrow > userRemainingCollateral) {
            amountBorrow = userRemainingCollateral;
            console.log("_borrow | amountBorrow > userRemainingCollateral | amountBorrow is: ", amountBorrow);
        }

        console.log("_borrow | userSummaryStorage.amountDAIBorrowed BEFORE", userSummaryStorage.amountDAIBorrowed);
        userSummaryStorage.amountDAIBorrowed += amountBorrow;
        console.log("_borrow | ADDING amountBorrow", amountBorrow);
        console.log("_borrow | userSummaryStorage.amountDAIBorrowed AFTER", userSummaryStorage.amountDAIBorrowed);
        _wipeInterestOwed(userSummaryStorage); // because we added it to their borrowed amount

        // carry forward the previous interest
        console.log("_borrow | userSummaryStorage.pendingInterests BEFORE", userSummaryStorage.pendingInterests);
        userSummaryStorage.pendingInterests = userAccruedInterest;
        console.log("_borrow | userSummaryStorage.pendingInterests AFTER", userSummaryStorage.pendingInterests);

        DAI.transfer(user, amountBorrow); // DAI transfer function doesnt need safe transfer

        console.log("_borrow | transfering DAI to borrow", user, amountBorrow);

        emit LoanTaken(amountBorrow, block.timestamp, user);
    }

    function _upsertCollateralInUserSummary(
        DebtorSummary storage userSummaryStorage,
        IERC20 token,
        uint256 amount
    ) private returns (uint256 collateralIndex) {
        // Insert or update operation
        require(amount != 0, "INVALID_AMOUNT");
        bool collateralAdded;

        // Loops over all provided collateral, checks if its there and if it is edit it
        uint256 length = userSummaryStorage.collateral.length;

        console.log("_upsertCollateralInUserSummary | usrSummaryStorage.collateral.length", length);

        for (uint256 i = 0; i < length; i++) {
            Collateral storage collateral = userSummaryStorage.collateral[i];

            console.log("_upsertCollateralInUserSummary | i", i);
            console.log("_upsertCollateralInUserSummary | collateral.collateralAddress", collateral.collateralAddress);
            console.log("_upsertCollateralInUserSummary | collateral.amountCollateral BEFORE", collateral.amountCollateral);
            console.log("_upsertCollateralInUserSummary | amount to add", amount);

            if (collateral.collateralAddress == address(token)) {
                console.log("_upsertCollateralInUserSummary | collateral.collateralAddress == address(token) ADDING COLLATERAL AMOUNT: ", amount);
                
                collateral.amountCollateral += amount;
                collateralIndex = i;
                collateralAdded = true;
            }

            console.log("_upsertCollateralInUserSummary | collateralIndex", collateralIndex);
            console.log("_upsertCollateralInUserSummary | collateralAdded", collateralAdded);
            console.log("_upsertCollateralInUserSummary | collateral.amountCollateral AFTER", collateral.amountCollateral);
        }

        // If it has not been already supplied we push it on
        if (!collateralAdded) {

            console.log("_upsertCollateralInUserSummary | !collateralAdded");

            collateralIndex = userSummaryStorage.collateral.length;

            console.log("_upsertCollateralInUserSummary | userSummaryStorage.collateral.length BEFORE", userSummaryStorage.collateral.length);
            
            console.log("_upsertCollateralInUserSummary | PUSHING NEW COLLATERAL:");
            console.log("   - collateralAddress", address(token));
            console.log("   - amountCollateral", amount);
            
            userSummaryStorage.collateral.push(
                Collateral({collateralAddress: address(token), amountCollateral: amount})
            );

            console.log("_upsertCollateralInUserSummary | userSummaryStorage.collateral.length AFTER", userSummaryStorage.collateral.length);
        }
    }

    function _isLiquidable(uint256 totalDebt, uint256 totalCollateral) private view returns (bool) {
        return totalDebt > (totalCollateral * loanDefaultThresholdPercent) / 100;
    }

    // Liquidates people in default
    // solcurity: C48
    function liquidateDelinquent(address user) external notHaram nonEntered returns (uint256 totalDebt, uint256 totalCollateral)  {
        return _liquidateDeliquent(user);
    }

    function _liquidateDeliquent(address user) private returns (uint256 totalDebt, uint256 totalCollateral) {
        totalDebt = userTotalDebt(user); // This is with interest
        totalCollateral = userCollateralValue(user);

        console.log("_liquidateDeliquent | totalDebt", totalDebt);
        console.log("_liquidateDeliquent | totalCollateral", totalCollateral);

        if (_isLiquidable(totalDebt, totalCollateral)) {
            console.log("_liquidateDeliquent | _isLiquidable");

            // user is in default, wipe their debt and collateral
            _liquidate(user); // only callsite
            emit Liquidation(user, totalCollateral, block.timestamp, msg.sender);
            return (0, 0);
        }
    }

    // Only called in liquidatedliquent
    // function of great consequence
    // Loops over all user supplied collateral of user, and sends it
    // to burn/beneficiary + pays 0.5% to caller if caller is not the user being liquidated.
    function _liquidate(address user) private  {
        // solcurity: C2 - debtorSummary[user]
        uint256 length = debtorSummary[user].collateral.length;

        console.log("_liquidate | length", length);

        for (uint256 i = 0; i < length; i++) {
            uint256 amount = debtorSummary[user].collateral[i].amountCollateral;
            address currentCollateralAddress = debtorSummary[user].collateral[i].collateralAddress;

            console.log("_liquidate | i", i);
            console.log("_liquidate | amount", amount);
            console.log("_liquidate | currentCollateralAddress", currentCollateralAddress);
            
            if (
                msg.sender == user || // User liquidates himself no incentive.
                currentCollateralAddress == address(coreDAO) || // no incentive for coreDAO to maintain floor, burned anyway
                currentCollateralAddress == address(CORE_TOKEN)
            ) {
                console.log("_liquidate | no incentive");

                // no incentive for core to maintain floor, and its burned anyway
                _safeTransfer(
                    currentCollateralAddress, //token
                    liquidationBeneficiaryOfToken[currentCollateralAddress], // to
                    amount //amount
                );

                console.log("_liquidate | no incentive | _safeTransfer to liquidationBeneficiaryOfToken", currentCollateralAddress, liquidationBeneficiaryOfToken[currentCollateralAddress], amount);
            } else {
                console.log("_liquidate | with incentive");

                // Someone else liquidates user 0.5% incentive (1/200)
                _safeTransfer(
                    currentCollateralAddress, //token
                    liquidationBeneficiaryOfToken[currentCollateralAddress], // to
                    (amount * 199) / 200 //amount 99.5%
                );

                console.log("_liquidate | no incentive | _safeTransfer to liquidationBeneficiaryOfToken 99.5%", currentCollateralAddress, liquidationBeneficiaryOfToken[currentCollateralAddress], (amount * 199) / 200);

                _safeTransfer(
                    currentCollateralAddress, //token
                    msg.sender, // to
                    amount / 200 //amount 0.5%
                );

                console.log("_liquidate | no incentive | _safeTransfer to sender 0.5%", currentCollateralAddress, msg.sender, amount / 200);
            }
        }

        // remove all collateral and debt
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

    function reclaimAllCollateral() external notHaram nonEntered {
        (uint256 totalDebt,) = _liquidateDeliquent(msg.sender);

        // Can only reclaim if there is collateral and 0 debt.
        // If user was liquidated by above call, then this will revert
        require(totalDebt == 0, "STILL_IN_DEBT");

        // solcurity: C2 - debtorSummary[msg.sender]
        uint256 length = debtorSummary[msg.sender].collateral.length;
        require(length > 0, "NOTHING_TO_CLAIM");

        console.log("reclaimAllCollateral | collateral length", length);
        for (uint256 i = 0; i < length; i++) {
            address collateralAddress = debtorSummary[msg.sender].collateral[i].collateralAddress;
            uint256 amount = debtorSummary[msg.sender].collateral[i].amountCollateral;

            console.log("reclaimAllCollateral | i", i);
            console.log("reclaimAllCollateral | collateralAddress", collateralAddress);
            console.log("reclaimAllCollateral | amount", amount);

            require(amount > 0, "SAFETY_CHECK_FAIL");

            _safeTransfer(
                collateralAddress, //token
                msg.sender, // to
                amount //amount
            );

            console.log("reclaimAllCollateral | _safeTransfer to sender", collateralAddress, msg.sender, amount);
                        
            emit CollateralReclaimed(collateralAddress, amount, block.timestamp, msg.sender);
        }

        // User doesnt have collateral anymore and paid off debt, bye
        delete debtorSummary[msg.sender];

        console.log("reclaimAllCollateral | verifying deleted debtorSummary[msg.sender] (should be all zero)");
        console.log("   - debtorSummary[msg.sender].timeLastBorrow", debtorSummary[msg.sender].timeLastBorrow);
        console.log("   - debtorSummary[msg.sender].amountDAIBorrowed", debtorSummary[msg.sender].amountDAIBorrowed);
        console.log("   - debtorSummary[msg.sender].pendingInterests", debtorSummary[msg.sender].pendingInterests);
        console.log("   - debtorSummary[msg.sender].collateral.length", debtorSummary[msg.sender].collateral.length);
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

        // Formula :
        // Accrued interest =
        // (DAI borrowed * percent interest per year * time since last loan ) / 365 days * 100
        // + interest already pending ( from previous updates )
        return
            ((userSummaryMemory.amountDAIBorrowed * yearlyPercentInterest * timeSinceLastLoan) / 365_00 days) + // 365days * 100 in seconds
            userSummaryMemory.pendingInterests;
    }

    function _wipeInterestOwed(DebtorSummary storage userSummaryStorage) private {
        userSummaryStorage.timeLastBorrow = block.timestamp;

        // solcurity: C38
        userSummaryStorage.pendingInterests = 0; // clear user pending interests

        console.log("_wipeInterestOwed | userSummaryStorage.timeLastBorrow", userSummaryStorage.timeLastBorrow);
        console.log("_wipeInterestOwed | userSummaryStorage.pendingInterests", userSummaryStorage.pendingInterests);
    }

    function userCollateralValue(address user) public view returns (uint256 collateral) {
        Collateral[] memory userCollateralTokens = debtorSummary[user].collateral;

        console.log("userCollateralValue | userCollateralTokens.length", userCollateralTokens.length);
        for (uint256 i = 0; i < userCollateralTokens.length; i++) {
            Collateral memory currentToken = userCollateralTokens[i];

            uint256 tokenDebit = collaterabilityOfToken[currentToken.collateralAddress] * currentToken.amountCollateral;
            collateral += tokenDebit;
        }

        console.log("userCollateralValue | collateral", collateral);
    }
}
