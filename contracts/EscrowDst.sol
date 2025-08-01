// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract EscrowDst is ReentrancyGuard {
    struct Swap {
        address initiator;
        address token;
        uint256 amount;
        bytes32 secretHash;
        uint256 timeout;
        bool claimed;
        bool exists;
    }

    mapping(bytes32 => Swap) public swaps;
    
    event Deposited(
        bytes32 indexed swapId,
        address indexed initiator,
        address token,
        uint256 amount,
        bytes32 secretHash,
        uint256 timeout
    );

    event Claimed(bytes32 indexed swapId, bytes32 secret);
    event Refunded(bytes32 indexed swapId);

    function deposit(
        bytes32 swapId,
        address token,
        uint256 amount,
        bytes32 secretHash,
        uint256 timeout
    ) external payable nonReentrant {
        require(!swaps[swapId].exists, "Swap already exists");
        require(timeout > block.timestamp, "Invalid timeout");
        
        if (token == address(0)) {
            require(msg.value == amount, "Incorrect ETH amount");
        } else {
            IERC20(token).transferFrom(msg.sender, address(this), amount);
        }

        swaps[swapId] = Swap({
            initiator: msg.sender,
            token: token,
            amount: amount,
            secretHash: secretHash,
            timeout: timeout,
            claimed: false,
            exists: true
        });

        emit Deposited(swapId, msg.sender, token, amount, secretHash, timeout);
    }

    function claim(bytes32 swapId, bytes32 secret) external nonReentrant {
        Swap storage swap = swaps[swapId];
        require(swap.exists, "Swap not found");
        require(!swap.claimed, "Already claimed");
        require(keccak256(abi.encodePacked(secret)) == swap.secretHash, "Invalid secret");
        
        swap.claimed = true;
        
        if (swap.token == address(0)) {
            payable(msg.sender).transfer(swap.amount);
        } else {
            IERC20(swap.token).transfer(msg.sender, swap.amount);
        }

        emit Claimed(swapId, secret);
    }

    function refund(bytes32 swapId) external nonReentrant {
        Swap storage swap = swaps[swapId];
        require(swap.exists, "Swap not found");
        require(!swap.claimed, "Already claimed");
        require(block.timestamp >= swap.timeout, "Too early to refund");
        
        swap.claimed = true;
        
        if (swap.token == address(0)) {
            payable(swap.initiator).transfer(swap.amount);
        } else {
            IERC20(swap.token).transfer(swap.initiator, swap.amount);
        }

        emit Refunded(swapId);
    }
}
