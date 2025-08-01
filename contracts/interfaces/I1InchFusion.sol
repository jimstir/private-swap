// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface I1InchFusion {
    struct OrderMatching {
        bytes32 orderHash;
        uint256 makerAmount;
        uint256 takerAmount;
        uint256 threshold;
        address maker;
        address taker;
        uint256 salt;
        uint64 expiry;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    function fillOrder(OrderMatching calldata order) external payable;
    function cancelOrder(bytes32 orderHash) external;
}
