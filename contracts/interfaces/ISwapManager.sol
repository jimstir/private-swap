// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ISwapManager
 * @dev Interface for the SwapManager contract that manages cross-chain swaps
 */
interface ISwapManager {
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

    /**
     * @notice Event emitted when a new order is created
     * @param orderId The unique identifier of the order
     * @param maker The address of the user who created the order
     * @param secretHash The hash of the secret used for the HTLC
     * @param amountIn The amount of input token
     * @param amountOutMin The minimum amount of output token
     * @param deadline The timestamp when the order expires
     * @param ltcRefundAddress The Litecoin address for refunds
     */
    event OrderCreated(
        bytes32 indexed orderId,
        address indexed maker,
        bytes32 secretHash,
        uint256 amountIn,
        uint256 amountOutMin,
        uint256 deadline,
        string ltcRefundAddress
    );

    /**
     * @notice Event emitted when an order is fulfilled
     * @param orderId The unique identifier of the order
     * @param resolver The address of the resolver who fulfilled the order
     * @param secret The secret revealed to claim the funds
     */
    event OrderFulfilled(
        bytes32 indexed orderId,
        address indexed resolver,
        bytes32 secret
    );

    /**
     * @notice Event emitted when an order is refunded
     * @param orderId The unique identifier of the order
     * @param initiator The address that initiated the refund
     */
    event OrderRefunded(
        bytes32 indexed orderId,
        address indexed initiator
    );

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
    ) external payable returns (bytes32 orderId);

    /**
     * @notice Fulfill an order after verifying LTC HTLC
     * @param orderId The order ID to fulfill
     * @param secret The secret to unlock the HTLC
     * @param oneInchOrder The 1inch Fusion order data
     */
    function fulfillOrder(
        bytes32 orderId,
        bytes32 secret,
        bytes calldata oneInchOrder
    ) external;

    /**
     * @notice Refund an expired order
     * @param orderId The order ID to refund
     */
    function refundOrder(bytes32 orderId) external;

    /**
     * @notice Get the details of a swap
     * @param orderId The unique identifier of the swap order
     * @return swap The swap details
     */
    function getSwap(bytes32 orderId) external view returns (Swap memory swap);
}
