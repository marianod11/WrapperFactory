// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {WrapperERC20} from "./WrapperERC20.sol";

contract WrapperFactory is Initializable, AccessControlUpgradeable, UUPSUpgradeable {

    bytes32 public constant ADMINISTRATOR_ROLE = keccak256("ADMINISTRATOR");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR");
    bytes32 public constant TREASURER_ROLE = keccak256("TREASURER");

    address private feeReceiver;
    uint256 private depositFee;
    uint256 public constant MAX_FEE = 2000;

    address public wrapperImplementation;
    address [] private _wrappedTokens;
    mapping(address => bool) private _isWrappedToken;

    error ZeroAddress();
    error FeeTooHigh(uint256 maxFee);
    error TokenAlreadyWrapped(address token);

    event WrappedTokenCreate(address indexed originalToken, address wrappedToken);
    event FeeReceiverChanged(address newReceiver);
    event DepositFeeChanged(uint256 newFee);
    event RoleGranted(bytes32 role, address account);
    event RoleRevoked(bytes32 role, address account);


    modifier onlyValidRole(bytes32 role) {
        require(
            role == ADMINISTRATOR_ROLE || 
            role == OPERATOR_ROLE || 
            role == TREASURER_ROLE,
           "Invalid role"
        );
        _;
    }

    function initialize(
        address _admin,
        address _operator,
        address _treasurer,
        address _feeReceiver,
        uint256 _initialFee
    ) public initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();
        
        _setRoleAdmin(OPERATOR_ROLE, ADMINISTRATOR_ROLE);
        _setRoleAdmin(TREASURER_ROLE, ADMINISTRATOR_ROLE);
        
        _grantRole(ADMINISTRATOR_ROLE, _admin);
        _grantRole(OPERATOR_ROLE, _operator);
        _grantRole(TREASURER_ROLE, _treasurer);
        
        feeReceiver = _feeReceiver;
        depositFee = _initialFee;
    }


    function deployWrappedToken(address tokenAddress) public {
        if (tokenAddress == address(0)) revert ZeroAddress();
        if (_isWrappedToken[tokenAddress]) revert TokenAlreadyWrapped(tokenAddress);
        if (wrapperImplementation == address(0)) revert ZeroAddress(); 

        ERC20 token = ERC20(tokenAddress);

        string memory name = string(abi.encodePacked("Wrapped-", token.name()));
        string memory symbol = string(abi.encodePacked("W-", token.symbol()));

        bytes memory initData = abi.encodeWithSelector(
            WrapperERC20.initialize.selector,
            tokenAddress,
            address(this),
            name,
            symbol
        );

        ERC1967Proxy proxy = new ERC1967Proxy(wrapperImplementation, initData);

        _wrappedTokens.push(address(proxy));
        _isWrappedToken[tokenAddress] = true;

        emit WrappedTokenCreate(tokenAddress, address(proxy));
    }

    function setImplementation(address _impl) external onlyRole(ADMINISTRATOR_ROLE) {
        if (_impl == address(0)) revert ZeroAddress();
        wrapperImplementation = _impl;
    }

    function setFeeReceiver(address _newReceiver) public onlyRole(TREASURER_ROLE) {
        if(_newReceiver == address(0)) revert ZeroAddress();
        feeReceiver = _newReceiver;
        emit FeeReceiverChanged(_newReceiver);
    }


    function setDepositFee(uint256 _newFee) public onlyRole(OPERATOR_ROLE) {
        if(_newFee >= MAX_FEE) revert FeeTooHigh(MAX_FEE);
        depositFee = _newFee;
        emit DepositFeeChanged(_newFee);
    }

    function grantRole(bytes32 role, address account) public override onlyValidRole(role) onlyRole(getRoleAdmin(role)) {
        _grantRole(role, account);
        emit RoleGranted(role, account);
    }
    
    function revokeRole(bytes32 role, address account) public override onlyValidRole(role) onlyRole(getRoleAdmin(role)) {
        _revokeRole(role, account);
        emit RoleRevoked(role, account);
    }

    function getWrappedTokens() external view returns(address[] memory) {
        return _wrappedTokens;
    }

    function getFeeReceiver() external view returns(address){
        return feeReceiver;
    }

    function getDepositFee() external view returns(uint256){
        return depositFee;
    }
 

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(ADMINISTRATOR_ROLE) {}

    uint256[50] private __gap;

}