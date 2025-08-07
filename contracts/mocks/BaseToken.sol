// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract BaseToken is ERC20, AccessControl, ERC20Permit {
    bytes32 public NAME_HASH;
    uint256 public constant INITIAL_SUPPLY = 20000000000e18;

    constructor(string memory name, string memory symbol) 
        ERC20(name, symbol)
        ERC20Permit(name) 
    {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _mint(msg.sender, INITIAL_SUPPLY);
        NAME_HASH = keccak256(bytes(name));
    }

    function mint(
        address to,
        uint256 amount
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _mint(to, amount);
    }

    function burn(uint256 amount) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _burn(msg.sender, amount);
    }
}