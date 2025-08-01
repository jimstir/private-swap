// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ResolverRegistry
 * @dev Manages registration and lookup of resolvers for the private swap protocol
 */
contract ResolverRegistry {
    struct Resolver {
        address resolverAddress;
        string endpoint; // Off-chain endpoint for communication
        bool isActive;
        uint256 stakedAmount; // Amount staked as collateral
    }

    mapping(address => Resolver) public resolvers;
    address[] public resolverAddresses;
    address public owner;
    
    // Minimum stake required to register as a resolver
    uint256 public constant MIN_STAKE = 1 ether;
    
    event ResolverRegistered(
        address indexed resolver,
        string endpoint,
        uint256 stakedAmount
    );
    
    event ResolverDeregistered(address indexed resolver);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    modifier onlyResolver() {
        require(resolvers[msg.sender].isActive, "Not a registered resolver");
        _;
    }
    
    constructor() {
        owner = msg.sender;
    }
    
    /**
     * @notice Register as a resolver by staking ETH
     * @param endpoint The off-chain endpoint where the resolver can be reached
     */
    function registerResolver(string memory endpoint) external payable {
        require(msg.value >= MIN_STAKE, "Insufficient stake");
        require(!resolvers[msg.sender].isActive, "Already registered");
        
        resolvers[msg.sender] = Resolver({
            resolverAddress: msg.sender,
            endpoint: endpoint,
            isActive: true,
            stakedAmount: msg.value
        });
        
        resolverAddresses.push(msg.sender);
        
        emit ResolverRegistered(msg.sender, endpoint, msg.value);
    }
    
    /**
     * @notice Deregister as a resolver and get stake back
     */
    function deregisterResolver() external onlyResolver {
        Resolver storage resolver = resolvers[msg.sender];
        require(resolver.isActive, "Not an active resolver");
        
        uint256 stakedAmount = resolver.stakedAmount;
        delete resolvers[msg.sender];
        
        // Remove from resolverAddresses array
        for (uint i = 0; i < resolverAddresses.length; i++) {
            if (resolverAddresses[i] == msg.sender) {
                resolverAddresses[i] = resolverAddresses[resolverAddresses.length - 1];
                resolverAddresses.pop();
                break;
            }
        }
        
        // Return staked ETH
        payable(msg.sender).transfer(stakedAmount);
        
        emit ResolverDeregistered(msg.sender);
    }
    
    /**
     * @notice Get total number of active resolvers
     */
    function getResolverCount() external view returns (uint256) {
        return resolverAddresses.length;
    }
    
    /**
     * @notice Get paginated list of resolver addresses
     */
    function getResolvers(uint256 offset, uint256 limit) 
        external 
        view 
        returns (address[] memory, string[] memory) 
    {
        uint256 end = offset + limit;
        if (end > resolverAddresses.length) {
            end = resolverAddresses.length;
        }
        
        uint256 count = end - offset;
        address[] memory addrs = new address[](count);
        string[] memory endpoints = new string[](count);
        
        for (uint256 i = 0; i < count; i++) {
            addrs[i] = resolverAddresses[offset + i];
            endpoints[i] = resolvers[addrs[i]].endpoint;
        }
        
        return (addrs, endpoints);
    }
    
    /**
     * @notice Check if an address is an active resolver
     */
    function isActiveResolver(address resolver) external view returns (bool) {
        return resolvers[resolver].isActive;
    }
}
