// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IFactory } from "./IFactory.sol";

contract WrapperERC20 is Initializable, ERC20Upgradeable, OwnableUpgradeable, UUPSUpgradeable {
    uint256 public constant FEE_DENOMINATOR = 10000;

    IERC20 public underlyingToken;
    IFactory public factory;

    event Deposit(
        address indexed user,
        uint256 amountDeposited,
        uint256 feeAmount,
        uint256 wrappedAmount,
        address feeReceiver
    );

    event Withdrawal(
        address indexed user,
        uint256 wrappedAmount,
        uint256 underlyingAmount
    );

    error ZeroAmount();
    error InvalidFactory();
    error InvalidUnderlyingToken();
    error TransferFailed();
    error InsufficientBalance();

    function initialize(
        address _underlyingToken,
        address _factory,
        string memory _name,
        string memory _symbol
    ) public initializer {
        if (_underlyingToken == address(0)) revert InvalidUnderlyingToken();
        if (_factory == address(0)) revert InvalidFactory();

        __ERC20_init(_name, _symbol);
        __Ownable_init(_factory);
        __UUPSUpgradeable_init();

        underlyingToken = IERC20(_underlyingToken);
        factory = IFactory(_factory);
    }

    function deposit(uint256 amount) external {
        _deposit(msg.sender, msg.sender, amount);
    }

    function depositWithPermit(
        address owner,
        address beneficiary,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        IERC20Permit(address(underlyingToken)).permit(
            owner,
            address(this),
            amount,
            deadline,
            v,
            r,
            s
        );

        _deposit(owner, beneficiary, amount);
    }

    function _deposit(address from, address to, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();

        address feeReceiver = factory.getFeeReceiver();
        uint256 fee = factory.getDepositFee();

        uint256 feeAmount = (amount * fee) / FEE_DENOMINATOR;
        uint256 netAmount = amount - feeAmount;

        bool success = underlyingToken.transferFrom(from, address(this), amount);
        if (!success) revert TransferFailed();

        if (feeAmount > 0) {
            success = underlyingToken.transfer(feeReceiver, feeAmount);
            if (!success) revert TransferFailed();
        }

        _mint(to, netAmount);

        emit Deposit(to, amount, feeAmount, netAmount, feeReceiver);
    }

    function withdraw(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (balanceOf(msg.sender) < amount) revert InsufficientBalance();

        _burn(msg.sender, amount);

        bool success = underlyingToken.transfer(msg.sender, amount);
        if (!success) revert TransferFailed();

        emit Withdrawal(msg.sender, amount, amount);
    }

    function totalUnderlying() external view returns (uint256) {
        return underlyingToken.balanceOf(address(this));
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    uint256[50] private __gap;
}
