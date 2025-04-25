// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title MySimpleContract
 * @dev A simple contract with basic functionality
 */
contract MySimpleContract {
    string private message;
    address public owner;
    uint256 public counter;
    
    event MessageChanged(string newMessage);
    event CounterIncremented(uint256 newValue);
    
    constructor(string memory initialMessage) {
        message = initialMessage;
        owner = msg.sender;
        counter = 0;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not the contract owner");
        _;
    }
    
    /**
     * @dev Set a new message
     * @param newMessage The new message to store
     */
    function setMessage(string memory newMessage) public onlyOwner {
        message = newMessage;
        emit MessageChanged(newMessage);
    }
    
    /**
     * @dev Get the current message
     * @return The stored message
     */
    function getMessage() public view returns (string memory) {
        return message;
    }
    
    /**
     * @dev Increment the counter
     */
    function incrementCounter() public {
        counter += 1;
        emit CounterIncremented(counter);
    }
} 