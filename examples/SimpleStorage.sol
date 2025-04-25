// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;  // IMPORTANT: Must use exactly 0.8.28 for Monad

/**
 * @title SimpleStorage
 * @dev A minimal storage contract example
 */
contract SimpleStorage {
    uint256 private value;
    
    event ValueChanged(uint256 newValue);
    
    function setValue(uint256 _newValue) public {
        value = _newValue;
        emit ValueChanged(_newValue);
    }
    
    function getValue() public view returns (uint256) {
        return value;
    }
} 