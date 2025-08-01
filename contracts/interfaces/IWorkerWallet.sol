// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IWorkerWallet {
    event Executed(address indexed target, uint256 value, bytes data, bool success);
    event Withdrawn(address token, uint256 amount, address to);
    
    function execute(
        address target,
        uint256 value,
        bytes calldata data
    ) external returns (bool success, bytes memory result);
    
    function withdraw(address token, uint256 amount, address to) external;
    
    function owner() external view returns (address);
    
    function swapManager() external view returns (address);
}
