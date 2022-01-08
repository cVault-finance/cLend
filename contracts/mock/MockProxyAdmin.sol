// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

interface MockTransparentUpgradeableProxy {
    function upgradeTo(address) external;
}

/**
 * @dev This is an auxiliary contract meant to be assigned as the admin of a {TransparentUpgradeableProxy}. For an
 * explanation of why you would want to use this see the documentation for {TransparentUpgradeableProxy}.
 */
contract MockProxyAdmin {
    function upgrade(MockTransparentUpgradeableProxy proxy, address implementation) public virtual {
        proxy.upgradeTo(implementation);
    }
}
