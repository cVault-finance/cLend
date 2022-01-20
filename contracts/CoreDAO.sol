// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title CoreDAO ERC20 Governance Token
 * @author CVault Finance
 */
contract CoreDAO is ERC20 {
    address public constant CORE_DAO_TREASURY = 0xe508a37101FCe81AB412626eE5F1A648244380de;

    /// @notice
    /// controller is initially the cLending contract, this can be modified
    /// by upgrading the cLending contract via the Governor contract voting with this tokens
    constructor(uint256 startingCOREDAOAmount) ERC20("CORE DAO", "CoreDAO") {
        _mint(CORE_DAO_TREASURY, startingCOREDAOAmount);
    }

    function issue(address to, uint256 amount) public {
        require(msg.sender == CORE_DAO_TREASURY, "NOT_TREASURY");
        _mint(to, amount);
    }

    function burn(uint256 amount) public {
        _burn(msg.sender, amount);
    }
}
