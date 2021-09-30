# cLending contract specification

This document outlines intended functionality of the cLending contract(s)

Users should be able to deposit tokenized collateral inside the contract
Collateral should be in the form of ERC20 tokens. Initially this is coreDAO and CORE only, but will later be expanded.

Value of this collateral is static and only changeable via the DAO (owner) of the contract

Upon deposit of this collateral its possible to calculate the value(in DAI) of it via
```collateral amount * asset collaterability```
Note that collaterability is not just price. For example, in the case of CORE, the collaterability is the *floor* price.

Users should be able to borrow DAI up to 100% of this value 1:1
eg. if CORE's floor (it's collaterability) was worth 5500 DAI inside the contract per token and the user would have 10 CORE in collateral, he should be able to borrow 55,000 DAI tokens

At the exact time of borrow a timestamp should be noted to calculate interest from the loan
Interest should be calculated each second based on the global interest variable 
with this equation
```  (amount dai borrowed * yearlyPercentInterest * timeSinceLastLoan) / 365 days in seconds / 100
```
eg.
``` 100 DAI borrowed * 10 yearly interest * 1,000,000 seconds since last loan / 31557600 / 100

1100000000 / 31557600 / 100

0.348 DAI in interest```

Amount a user can borrow should be capped at 100% of their collateral value - already accrued interest

When a user's debt, defined as (amount borrowed + unpaid interest), exceeds 110% of their collateral's value, they can be liquidated.
Liquidation is the process carried out by any user, in which the borrower surrenders his collateral to a pre-defined address.
For arbitrary tokens, there is a 0.5% fee paid to the caller from the collateral the borrower put up. The remaining 99.5% of the collateral goes to the coreDAO treasury.
For CORE and coreDAO, the tokens are instead burned, and there is no fee paid to the caller. (This maintains the floor)


public functions that should be in the contract

### addCollateral
User specifies token he wants to add collateral off, it checks against the list of tokens that have colleratibility inside the contract.
If this token has collaterability and offered colletarability is above 0
We add this token to users array of collateral tokens, and now they have colleteral that can be used in borrowing

### borrow
We let user specify the number of DAI they want to borrow,
We check if they have enough collateral to do so, accounting for already accrued interest
We repay all accrued interest with the loan
If the loan is smaller than the already accrued interest we revert
If the user is already on the verge of liquidation, we revert

### repay
We let the user repay all the loan amount he had taken in DAI
This repayment can be with any token that has collateral and the collateral will be counted by the collaterability of that token
This function should cap at the (max accrued interest + amount borrowed) and not take the rest
This function has a minimum amount that can be repaid, which is the total accrued interest.
require( (accruedInterest + amountBorrowed) >= repayAmount >= accruedInterest )
If the user attempts to exceed the maximum repayAmount, we cap it at that max amount rather than reverting.

### liquidate
Check if the user can be liquidated and do so, by taking his colleteral token and distributing it to the collateral beneficiaries
this would be a burn address for CORE and a burn address for CORE DAO tokens because their floor value depends on deliquent collateral being burned

