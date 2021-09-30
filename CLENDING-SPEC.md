# cLending contract specification

This document outlines intended functionality of the cLending contract(s)

Users should be able to deposit tokenized collateral inside the contract
Collateral should be in the form of ERC20 tokens

Value of this collateral is static and only changeable via the DAO (owner) of the contract

Upon deposit of this collateral its possible to calculate the value(in DAI) of it via
```collateral amount * asset collaterability```

Users should be able to borrow DAI up to 100% of this value 1:1
eg. if CORE was worth 5500 DAI inside the contract per each and the user would have 10 CORE in collateral
he should be able to borrow 55,000 DAI tokens

At the exact time of borrow a timestamp should be noted to calculate interest from the loan
Interest should be calculated each second based on the global interest variable 
with this equation
```  (amount dai borrowed * yearlyPercentInterest * timeSinceLastLoan) / 365 days in seconds / 100
```
eg.
``` 100 DAI borrowed * 110 yearly interst * 1,000,000 seconds since last loan / 31557600 / 100

11000000000 / 31557600 / 100

3.48 DAI in interest```

Amount a user can borrow should be capped at 100% of their collateral value - already accrued interest

at 110%(changable variable) of their collateral being in accrued interest+borrowed amount each user should be able to be liquidated by anyone else, or be liquidated by calling any function (some functions it will be impossible and it should revert instead)


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
This repayment can be with any token that has colleteral and the collateral will be counted by the colleterability of that token
This function should cap at the max accrued interest + amount borrowed and not take the rest
This function should only allow to repay the minimum of all of the accured interest
### liquidate
Check if the user can be liquidated and do so, by taking his colleteral token and distributing it to the collateral beneficiaries
this would be a burn address for CORE and a burn address for CORE DAO tokens because their floor value depends on deliquent collateral being burned

