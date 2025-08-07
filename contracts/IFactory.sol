// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IFactory {
    function getFeeReceiver() external view returns (address);
    function getDepositFee() external view returns (uint256);
}