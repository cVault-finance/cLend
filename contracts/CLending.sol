// SPDX-License-Identifier: UNLICENSED

pragma solidity =0.8.6;
// TODO check diffecences with safemath

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "./CLendingLibrary.sol";
import "./types/CLendingTypes.sol";
import "hardhat/console.sol";// TODO remove console logs
import "./CLendingEventEmitter.sol";

/**
 * @title Lending contract for CORE and CoreDAO
 * @author CVault Finance
 */
contract CLending is OwnableUpgradeable,cLendingEventEmitter {
    using CLendingLibrary for IERC20;

    IERC20 public constant DAI = IERC20(0x6B175474E89094C44Da98b954EedeAC495271d0F);
    IERC20 public constant CORE_TOKEN = IERC20(0x62359Ed7505Efc61FF1D56fEF82158CcaffA23D7);
    address private constant DEADBEEF = 0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF;

    mapping(address => DebtorSummary) public debtorSummary;
    mapping(address => uint256) public collaterabilityOfToken;
    mapping(address => address) public liquidationBeneficiaryOfToken;
    mapping(address => bool) public tokenRetired; // Since the whitelist is based on collatarability of token
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
    
        changeLoanTerms(_yearlyPercentInterest,_loanDefaultThresholdPercent);

        require(loanDefaultThresholdPercent > 100, "Instant liquidation would be possible");

        addNewToken(address(_daoToken), DEADBEEF, 1, 18);
        addNewToken(address(CORE_TOKEN), DEADBEEF, _coreTokenCollaterability, 18);
        addNewToken(address(DAI), _coreDAOTreasury, 1, 18); // DAI should never be liquidated but this is just in case

        coreDAO = _daoToken;
    }

    receive() external payable {
        revert("CLending: ETH_NOT_ACCEPTED");
    }

    // It should be noted that this will change everything backwards in time meaning some people might be liquidated right away
    function changeLoanTerms(uint256 _yearlyPercentInterest, uint256 _loanDefaultThresholdPercent) public onlyOwner {
        emit LoanTermsChanged(yearlyPercentInterest, _yearlyPercentInterest, block.timestamp, msg.sender);

        yearlyPercentInterest = _yearlyPercentInterest;
        loanDefaultThresholdPercent = _loanDefaultThresholdPercent;
    }


    // TODO add market supported check so can retire tokens to 0
    function editTokenCollaterability(address token, uint256 newCollaterability) public onlyOwner {
        emit TokenCollaterabilityChanged(token, collaterabilityOfToken[token], newCollaterability, block.timestamp, msg.sender);
        require(liquidationBeneficiaryOfToken[token] != address(0), "Token not added");
        if(newCollaterability == 0) {
            tokenRetired[token] = true;
        } else {
            collaterabilityOfToken[token] = newCollaterability;
            tokenRetired[token] = false;
        }
    }

    // warning this does not support different amount than 18 decimals
    function addNewToken(address token, address liquidationBeneficiary, uint256 collaterabilityInDAI, uint256 decimals) public onlyOwner {
        
        /// 1e18 CORE = 5,500 e18 DAI
        /// 1units CORE = 5,500units DAI
        // $1DAI = 1e18 units

        /// wBTC = 1e8
        /// collaterability of wbtc  40,000e10
        /// totalCollaterability = how much UNITS of DAI one UNIT of this token is worth
        // Collapse = worth less than 1 dai per unit ( 1e18 token is worth less than $1 or token has higher decimals than than 1e18)
        require(decimals == 18, "This contract doesn't support tokens with amount of decimals different than 18. Do not use this token. Or everything will break");
        require(collaterabilityOfToken[token] == 0 && liquidationBeneficiaryOfToken[token] == address(0), "Token already added");
        if(liquidationBeneficiary == address(0)) { liquidationBeneficiary=DEADBEEF; } // covers not send to 0 tokens
        require(collaterabilityInDAI > 0, "Token collerability should be above 0");
        emit NewTokenAdded(token, collaterabilityInDAI, liquidationBeneficiary, block.timestamp, msg.sender);
        liquidationBeneficiaryOfToken[token] = liquidationBeneficiary;
        collaterabilityOfToken[token] = collaterabilityInDAI;
    }

    function editTokenLiquiationBeneficiary(address token, address newBeneficiary) public onlyOwner {
        // Since beneficiary defaults to deadbeef it cannot be 0 if its been added before
        require(liquidationBeneficiaryOfToken[token] != address(0), "token not added");
        require(token != address(CORE_TOKEN) && token != address(coreDAO)); // Those should stay burned or floor doesnt hold
        if(newBeneficiary == address(0)) { newBeneficiary=DEADBEEF; } // covers not send to 0 tokens
        emit TokenLiquidationBeneficiaryChanged(token, liquidationBeneficiaryOfToken[token], newBeneficiary, block.timestamp, msg.sender);
       liquidationBeneficiaryOfToken[token] = newBeneficiary;
    }
    // Repays the loan supplying collateral and not adding it
    function repayLoan(IERC20 token, uint256 amount) public {
        DebtorSummary storage userSummaryStorage = debtorSummary[msg.sender];
        (uint256 totalDebt, ) = liquidateDelinquent(msg.sender);
        require(totalDebt > 0, "CLending: NOT_DEBT");

        uint256 tokenCollateralAbility = collaterabilityOfToken[address(token)];
        uint256 offeredCollateralValue = amount * tokenCollateralAbility;
        require(offeredCollateralValue > 0, "CLending: NOT_ENOUGH_COLLATERAL_OFFERED"); // covers both cases its a not supported token and 0 case
        require(tokenRetired[address(token)] == false, "CLending : TOKEN_RETIRED");

        uint256 _accruedInterest = accruedInterest(msg.sender);
        require(offeredCollateralValue >= _accruedInterest, "CLending: INSUFFICIENT_AMOUNT"); // Has to be done because we have to update debt time
        // Note that acured interest is never bigger than 10% of supplied collateral because of liquidateDelinquent call above
        if (offeredCollateralValue > totalDebt) {
            amount = quantityOfTokenForValueInDAI(totalDebt, tokenCollateralAbility); // TODO: Add unit test
            userSummaryStorage.amountDAIBorrowed = 0;
            // Updating debt time is not nessesary since accrued interest on 0 will always be 0

        } else {
            userSummaryStorage.amountDAIBorrowed =
                userSummaryStorage.amountDAIBorrowed -
                (offeredCollateralValue - _accruedInterest); // Parenthesis is important as their collateral is garnished by accrued interest repayment
            // Send the repayment amt
            wipeInterestOwed(userSummaryStorage);
        }

        token.safeTransferFrom(msg.sender, amount); // amount is changed if user supplies more than is neesesry to wipe their debt and interest
        emit Repayment(address(token), amount,block.timestamp, msg.sender);
        emit InterestPaid(address(token), _accruedInterest, block.timestamp, msg.sender);
        // Send the accrued interest back to the DAO
        safeTransfer(address(token), coreDAOTreasury, quantityOfTokenForValueInDAI(_accruedInterest, tokenCollateralAbility));
    }

    function quantityOfTokenForValueInDAI(uint256 quantityOfDAI, uint256 tokenCollateralAbility) public pure returns(uint256) {
        require(tokenCollateralAbility > 0, "CLending: TOKEN_UNSUPPORTED");
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

        require(token != DAI, "CLending: DAI_IS_ONLY_FOR_REPAYMENT");

        uint256 tokenCollateralAbility = collaterabilityOfToken[address(token)]; // essentially a whitelist
        require(tokenRetired[address(token)] == false, "CLending : TOKEN_RETIRED");

        require(tokenCollateralAbility != 0, "CLending: NOT_ACCEPTED");

        token.safeTransferFrom(user, amount);

        // We pay interest already accrued with the same mechanism as repay fn
        uint256 accruedInterestInToken = quantityOfTokenForValueInDAI(accruedInterest(user), tokenCollateralAbility); // eg. 6000 accrued interest and 1 CORE == 1 

        require(accruedInterestInToken < amount, "CLending: INSUFFICIENT_AMOUNT"); //  we dont want 0 amount

        if(accruedInterestInToken > 0) {
            safeTransfer(address(token), coreDAOTreasury, accruedInterestInToken);
        }

        // We add collateral into the user struct
        upsertCollateralInUserSummary(userSummaryStorage, token, amount - accruedInterestInToken);
        emit CollateralAdded(address(token), amount, block.timestamp, msg.sender);

        wipeInterestOwed(userSummaryStorage); // wipes accrued interest

    }

    function addCollateral(IERC20 token, uint256 amount) public {
        DebtorSummary storage userSummaryStorage = debtorSummary[msg.sender];
        _supplyCollateral(userSummaryStorage, msg.sender, token, amount);
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



    // Repays all users accumulated interst with margin
    // Then checks if borrow can be preformed, adds it to total borrowed as well as transfers the dai to user
    function _borrow(
        DebtorSummary storage userSummaryStorage,
        address user,
        uint256 amountBorrow
    ) private {

        // We take users accrued interest and the amount borrowed
        // We repay the accured interest from the loan amount, by adding it on top of the loan amount
        uint256 totalCollateral = userCollateralValue(user); // Value of collateral in DAI
        uint256 userAccruedInterest = accruedInterest(user); // Interest in DAI
        uint256 totalAmountBorrowed = userSummaryStorage.amountDAIBorrowed;
        uint256 totalDebt = userAccruedInterest + totalAmountBorrowed;

        require(amountBorrow > 0, "Borrow something"); // This is intentional after adding accured interest
        require(totalDebt <= totalCollateral, "CLending: OVER_DEBTED");

        uint256 userRemainingCollateral = totalCollateral - totalDebt; // User's collateral before making this loan
        // If the amount borrow is higher than remaining collateral, cap it
        if (amountBorrow > userRemainingCollateral) {
            amountBorrow = userRemainingCollateral;
        }
        // TODO write sanity tests
        userSummaryStorage.amountDAIBorrowed = userSummaryStorage.amountDAIBorrowed + amountBorrow + userAccruedInterest;
        wipeInterestOwed(userSummaryStorage); // because we added it to their borrowed amount

        DAI.transfer(user, amountBorrow); // DAI transfer function doesnt need safe transfer
        emit LoanTaken( amountBorrow + userAccruedInterest, block.timestamp, user); // real loan taken is with interest cause we are calculating interest on the interest repayment so its a loan
        if(userAccruedInterest > 0) {
            emit InterestPaid(address(DAI), userAccruedInterest, block.timestamp, user);
            DAI.transfer(coreDAOTreasury, userAccruedInterest); // accured interest is in DAI, and we added it to amount borrowed
        }
    }

    function upsertCollateralInUserSummary(
        DebtorSummary storage userSummaryStorage,
        IERC20 token,
        uint256 amount
    ) private {
        // Insert or update operation 
        require(amount != 0, "Supply collateral");
        // Loops over all provided collateral, checks if its there and if it is edit it
        for (uint256 i = 0; i < userSummaryStorage.collateral.length; i++) {
            if (userSummaryStorage.collateral[i].collateralAddress == address(token)) {
                userSummaryStorage.collateral[i].amountCollateral =
                    userSummaryStorage.collateral[i].amountCollateral +
                    amount;
                return; // we are just adding one collateral so we can return instead
            }
        }

        // If it has not been already supplied we push it on
        userSummaryStorage.collateral.push(
            Collateral({collateralAddress: address(token), amountCollateral: amount})
        );
    }

    function isLiquidable(uint256 totalDebt, uint256 totalCollateral) private view returns (bool) {
        return totalDebt > (totalCollateral * loanDefaultThresholdPercent) / 100;
    }

    // Liquidates people in default
    function liquidateDelinquent(address user) public returns (uint256 totalDebt, uint256 totalCollateral) {
        totalDebt = userTotalDebt(user); // This is with interest
        totalCollateral = userCollateralValue(user);

        if (isLiquidable(totalDebt, totalCollateral)) {
            console.log("User is liquidatable, liqudating");
            // user is in default, wipe their debt and collateral
            liquidate(user);
            emit Liquidation(user, totalCollateral, block.timestamp, msg.sender);
            return (0, 0);
        }
    }

    function liquidate(address user) private {

        for (uint256 i = 0; i < debtorSummary[user].collateral.length; i++) {
            console.log("Liquidation loop count ", i+1);
            uint256 amount = debtorSummary[user].collateral[i].amountCollateral;
            address currentCollateralAddress = debtorSummary[user].collateral[i].collateralAddress;

            if(msg.sender == user ||// User liquidates himself no incentive.
               currentCollateralAddress == address(coreDAO) || // no incentive for coreDAO to maintain floor, burned anyway
               currentCollateralAddress == address(CORE_TOKEN)) { // no incentive for core to maintain floor, and its burned anyway
                safeTransfer(
                    currentCollateralAddress, //token
                    liquidationBeneficiaryOfToken[currentCollateralAddress], // to
                    amount //amount
                );
            } else { // Someone else liquidates user 0.5% incentive (1/200)
                safeTransfer(
                    currentCollateralAddress, //token
                    liquidationBeneficiaryOfToken[currentCollateralAddress], // to
                    amount * 199 / 200 //amount 99.5%
                );
                safeTransfer(
                    currentCollateralAddress, //token
                    msg.sender, // to
                    amount / 200 //amount 0.5%
                );
            }
        }

        delete debtorSummary[user]; // remove all collateral and debt



    }

    function safeTransfer(address token, address to, uint value) private {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(bytes4(keccak256(bytes('transfer(address,uint256)'))), to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), 'cLending: TRANSFER_FAILED');
    }

    function reclaimAllCollateral() public {
        (uint256 totalDebt, uint256 totalCollateral) = liquidateDelinquent(msg.sender);

        require(totalCollateral > 0, "CLending: NOTHING_TO_CLAIM");
        require(totalDebt == 0, "CLending: STILL_IN_DEBT");

        for (uint256 i = 0; i < debtorSummary[msg.sender].collateral.length; i++) {
            address collateralAddress = debtorSummary[msg.sender].collateral[i].collateralAddress;
            uint256 amount = debtorSummary[msg.sender].collateral[i].amountCollateral;
            safeTransfer(
                    collateralAddress, //token
                    msg.sender, // to
                    amount //amount
            );
            emit CollateralReclaimed(collateralAddress,amount, block.timestamp, msg.sender);
        }

        // User doesnt have collateral anymore and paid off debt, bye
        delete debtorSummary[msg.sender];
    }

    function userCollateralValue(address user) public view returns (uint256 collateral) {
        Collateral[] memory userCollateralTokens = debtorSummary[user].collateral;

        for (uint256 i = 0; i < userCollateralTokens.length; i++) {
            Collateral memory currentToken = userCollateralTokens[i];

            if(tokenRetired[currentToken.collateralAddress]) {
                continue; // If token is retired it has no value
            }
            uint256 tokenDebit = collaterabilityOfToken[currentToken.collateralAddress] *
                currentToken.amountCollateral;
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


    function wipeInterestOwed(DebtorSummary storage userSummaryStorage) private {
        userSummaryStorage.timeLastBorrow = block.timestamp;
    }
}
