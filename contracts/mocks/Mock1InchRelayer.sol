// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title Mock1InchRelayer
 * @dev Simulates 1inch Fusion order book for local testing
 */
contract Mock1InchRelayer is ReentrancyGuard {
    struct Order {
        address maker;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 amountOutMin;
        uint256 deadline;
        bytes32 secretHash;
        bool filled;
    }

    mapping(bytes32 => Order) public orders;
    mapping(address => bool) public resolvers;
    address public owner;

    event OrderCreated(
        bytes32 indexed orderId,
        address indexed maker,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        uint256 deadline,
        bytes32 secretHash
    );

    event OrderFilled(
        bytes32 indexed orderId,
        address indexed resolver,
        bytes32 secretHash
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyResolver() {
        require(resolvers[msg.sender], "Not a resolver");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function addResolver(address resolver) external onlyOwner {
        resolvers[resolver] = true;
    }

    function removeResolver(address resolver) external onlyOwner {
        resolvers[resolver] = false;
    }

    function createOrder(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        uint256 deadline,
        bytes32 secretHash
    ) external nonReentrant returns (bytes32) {
        require(deadline > block.timestamp, "Deadline must be in the future");
        require(amountIn > 0, "Amount must be greater than 0");

        bytes32 orderId = keccak256(
            abi.encodePacked(
                msg.sender,
                block.timestamp,
                tokenIn,
                tokenOut,
                amountIn,
                amountOutMin,
                secretHash
            )
        );

        orders[orderId] = Order({
            maker: msg.sender,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: amountIn,
            amountOutMin: amountOutMin,
            deadline: deadline,
            secretHash: secretHash,
            filled: false
        });

        // Transfer tokens from maker to this contract
        if (tokenIn != address(0)) {
            IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        } else {
            require(msg.value == amountIn, "Incorrect ETH amount");
        }

        emit OrderCreated(
            orderId,
            msg.sender,
            tokenIn,
            tokenOut,
            amountIn,
            amountOutMin,
            deadline,
            secretHash
        );

        return orderId;
    }

    function fillOrder(
        bytes32 orderId,
        uint256 amountOut,
        bytes32 secretHash
    ) external payable nonReentrant onlyResolver {
        Order storage order = orders[orderId];
        require(!order.filled, "Order already filled");
        require(block.timestamp <= order.deadline, "Order expired");
        require(order.secretHash == secretHash, "Invalid secret hash");
        require(amountOut >= order.amountOutMin, "Insufficient output amount");

        order.filled = true;

        // Transfer tokens to resolver
        if (order.tokenIn != address(0)) {
            IERC20(order.tokenIn).transfer(msg.sender, order.amountIn);
        } else {
            payable(msg.sender).transfer(order.amountIn);
        }

        emit OrderFilled(orderId, msg.sender, secretHash);
    }

    function cancelOrder(bytes32 orderId) external nonReentrant {
        Order storage order = orders[orderId];
        require(msg.sender == order.maker, "Not order maker");
        require(!order.filled, "Order already filled");
        require(block.timestamp > order.deadline, "Order not expired");

        order.filled = true;

        // Return tokens to maker
        if (order.tokenIn != address(0)) {
            IERC20(order.tokenIn).transfer(order.maker, order.amountIn);
        } else {
            payable(order.maker).transfer(order.amountIn);
        }
    }
}
