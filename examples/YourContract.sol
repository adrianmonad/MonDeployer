// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;  // IMPORTANT: Always use this exact version for Monad

/**
 * @title Your Contract Name
 * @dev A brief description of your contract
 */
contract YourContract {
    // State variables
    address public owner;
    uint256 public value;
    
    // Events
    event ValueUpdated(uint256 newValue);
    
    // Constructor
    constructor() {
        owner = msg.sender;
    }
    
    // Modifier
    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }
    
    // Functions
    function setValue(uint256 _newValue) public onlyOwner {
        value = _newValue;
        emit ValueUpdated(_newValue);
    }
    
    function getValue() public view returns (uint256) {
        return value;
    }
} 