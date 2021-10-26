# Estimated Time Before Liquidation Formula

```javascript
const currentTimestampInSeconds = Math.floor(Date.now() / 1000);
const oneYearInSeconds = 365 * 24 * 60 * 60;
const oneDayInSeconds = 24 * 60 * 60;

// Get from smart contracts, the current values are just for example.
const totalCollateral = 100_000; // userCollateralValue(user)
const treshold = 110; // loanDefaultThresholdPercent
const amountDAIBorrowed = 70_000; // debtorSummary[user].amountDAIBorrowed

// 70_000 borrowed + 10_000 in accrued interests
const totalDebt = 80_800; // userTotalDebt(user)

const timeLastBorrow = currentTimestampInSeconds - oneDayInSeconds; // debtorSummary[user].timeLastBorrow
const yearlyPercentInterest = 20; // yearlyPercentInterest

const liquidationAmount = (totalCollateral * treshold) / 100;
const ltv = totalDebt / liquidationAmount;
const deltaAmountBeforeLiquidation =
  (liquidationAmount - totalDebt) * (oneYearInSeconds * 100);

const liquidationEstTimestamp = Math.floor(
  deltaAmountBeforeLiquidation / (amountDAIBorrowed * yearlyPercentInterest) +
    currentTimestampInSeconds
);

const liquidationEstTimestampInHours = liquidationEstTimestamp / 60 / 60;

console.log(`LTV: ${(ltv * 100).toFixed(2)}%`);
console.log("Current Time in Seconds", currentTimestampInSeconds);
console.log("Liquidation Time in Seconds", liquidationEstTimestamp);
console.log(
  "Days Left Before Liquidation",
  (liquidationEstTimestamp - currentTimestampInSeconds) / 60 / 60 / 24
);
```
