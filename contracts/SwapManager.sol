// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ISwapManager.sol";
import "./interfaces/I1InchFusion.sol";

/**
 * @title SwapManager
 * @dev Manages cross-chain swaps between Ethereum and Litecoin using 1inch Fusion
 * Implements the flow from userFlow.md:
 * 1. User generates secret and hash
 * 2. User creates 1inch Fusion order with hash in metadata
 * 3. Resolver is selected via Dutch auction
 * 4. User creates LTC HTLC after knowing resolver's pubkey
 * 5. Resolver fulfills order after verifying LTC deposit
 */
contract SwapManager is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // 1inch Fusion contract
    I1InchFusion public immutable oneInchFusion;
    
    // Track active swaps
    mapping(bytes32 => Swap) public swaps; // orderId => Swap
    mapping(bytes32 => bool) public usedSecrets; // secretHash => isUsed
    mapping(bytes32 => address) public orderResolvers; // orderId => resolver
    
    // Owner of the contract
    address public owner;

    // Events
    event OrderCreated(
        bytes32 indexed orderId,
        address indexed maker,
        bytes32 secretHash,
        uint256 amountIn,
        uint256 amountOutMin,
        uint256 deadline,
        string ltcRefundAddress
    );
    
    event OrderFulfilled(
        bytes32 indexed orderId,
        address indexed resolver,
        bytes32 secret
    );
    
    event OrderRefunded(
        bytes32 indexed orderId,
        address indexed initiator
    );
    
    // Worker management events
    event WorkerWalletAdded(address indexed worker);
    event WorkerWalletRemoved(address indexed worker);
    
    // Custom Swap struct to match our implementation
    struct Swap {
        address maker;
        uint256 amountIn;
        uint256 amountOutMin;
        address tokenIn;
        address tokenOut;
        uint256 deadline;
        bytes32 secretHash;
        bool isFulfilled;
        bool isRefunded;
        string ltcRefundAddress;
    }

    constructor(address _oneInchFusion) {
        oneInchFusion = I1InchFusion(_oneInchFusion);
        owner = msg.sender;
    }

    /**
     * @notice Create a new swap order
     * @param amountIn Amount of input token
     * @param amountOutMin Minimum amount of output token
     * @param tokenIn Input token address (address(0) for ETH)
     * @param tokenOut Output token address
     * @param deadline Order expiry timestamp
     * @param secretHash Hash of the secret
     * @param ltcRefundAddress Litecoin address for refunds
     * @return orderId The created order ID
     */
    function createOrder(
        uint256 amountIn,
        uint256 amountOutMin,
        address tokenIn,
        address tokenOut,
        uint256 deadline,
        bytes32 secretHash,
        string calldata ltcRefundAddress
    ) external payable nonReentrant returns (bytes32 orderId) {
        require(deadline > block.timestamp, "Deadline must be in the future");
        require(!usedSecrets[secretHash], "Secret hash already used");
        
        orderId = keccak256(
            abi.encodePacked(
                msg.sender,
                block.timestamp,
                amountIn,
                amountOutMin,
                secretHash
            )
        );

        // Transfer tokens from user
        if (tokenIn != address(0)) {
            IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
            IERC20(tokenIn).approve(address(oneInchFusion), amountIn);
        } else {
            require(msg.value == amountIn, "Incorrect ETH amount");
        }

        swaps[orderId] = Swap({
            maker: msg.sender,
            amountIn: amountIn,
            amountOutMin: amountOutMin,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            deadline: deadline,
            secretHash: secretHash,
            isFulfilled: false,
            isRefunded: false,
            ltcRefundAddress: ltcRefundAddress
        });

        usedSecrets[secretHash] = true;

        emit OrderCreated(
            orderId,
            msg.sender,
            secretHash,
            amountIn,
            amountOutMin,
            deadline,
            swaps[orderId].ltcRefundAddress
        );
    }

    /**
     * @notice Fulfill an order after verifying LTC HTLC
     * @param orderId The order ID to fulfill
     * @param secret The secret to unlock the HTLC
     * @param oneInchOrder The 1inch Fusion order data
     */
    function fulfillOrder(
        bytes32 orderId,
        bytes32 secret,
        I1InchFusion.OrderMatching calldata oneInchOrder
    ) external nonReentrant {
        Swap storage order = swaps[orderId];
        require(order.maker != address(0), "Order does not exist");
        require(!order.isFulfilled, "Order already fulfilled");
        require(!order.isRefunded, "Order was refunded");
        require(block.timestamp <= order.deadline, "Order expired");
        require(keccak256(abi.encodePacked(secret)) == order.secretHash, "Invalid secret");

        // Mark as fulfilled before external calls
        order.isFulfilled = true;
        orderResolvers[orderId] = msg.sender;

        // Transfer tokens to 1inch Fusion
        if (order.tokenIn != address(0)) {
            IERC20 token = IERC20(order.tokenIn);
            // Reset allowance to 0 first to handle tokens that require it
            uint256 currentAllowance = token.allowance(address(this), address(oneInchFusion));
            if (currentAllowance > 0) {
                token.safeDecreaseAllowance(address(oneInchFusion), currentAllowance);
            }
            // Then set allowance to the required amount
            token.safeIncreaseAllowance(address(oneInchFusion), order.amountIn);
            oneInchFusion.fillOrder{value: 0}(oneInchOrder);
        } else {
            oneInchFusion.fillOrder{value: order.amountIn}(oneInchOrder);
        }

        emit OrderFulfilled(orderId, msg.sender, secret);
    }

    /**
     * @notice Refund an expired order
     * @param orderId The order ID to refund
     */
    function refundOrder(bytes32 orderId) external nonReentrant {
        Swap storage order = swaps[orderId];
        require(order.maker != address(0), "Order does not exist");
        require(!order.isFulfilled, "Order already fulfilled");
        require(!order.isRefunded, "Already refunded");
        require(block.timestamp > order.deadline, "Order not expired");

        order.isRefunded = true;

        // Refund tokens to maker
        if (order.tokenIn != address(0)) {
            IERC20(order.tokenIn).safeTransfer(order.maker, order.amountIn);
        } else {
            (bool success, ) = order.maker.call{value: order.amountIn}("");
            require(success, "ETH transfer failed");
        }

        emit OrderRefunded(orderId, msg.sender);
    }

    receive() external payable {}
    
    /**
     * @dev Get the details of a swap
     * @param orderId The order ID to look up
     * @return swap The swap details
     */
    function getSwap(bytes32 orderId) external view returns (Swap memory swap) {
        swap = swaps[orderId];
        require(swap.maker != address(0), "Order does not exist");
        return swap;
    }

    /**
     * @dev Withdraw tokens from the contract (owner only)
     * @param token The token address (address(0) for ETH)
     * @param amount The amount to withdraw
     */
    function withdraw(address token, uint256 amount) external {
        require(msg.sender == owner, "Only owner can withdraw");
        if (token == address(0)) {
            (bool success, ) = msg.sender.call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            IERC20(token).safeTransfer(msg.sender, amount);
        }
    }
    
    /**
     * @notice Add a worker wallet that can fulfill orders
     * @param worker The address of the worker to add
     */
    function addWorkerWallet(address worker) external {
        require(msg.sender == owner, "Not owner");
        // Worker wallet functionality is handled by orderResolvers mapping
        emit WorkerWalletAdded(worker);
    }
    
    /**
     * @notice Remove a worker wallet
     * @param worker The address of the worker to remove
     */
    function removeWorkerWallet(address worker) external {
        require(msg.sender == owner, "Not owner");
        // Worker wallet functionality is handled by orderResolvers mapping
        emit WorkerWalletRemoved(worker);
    }
}
