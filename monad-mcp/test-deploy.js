// Simple test to verify the deploy-contract tool works correctly
import { tools } from './dist/index.js';

// Super simple token contract for testing
const sourceCode = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract BasicToken {
    string public name;
    string public symbol;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    
    event Transfer(address indexed from, address indexed to, uint256 value);

    constructor(string memory _name, string memory _symbol, uint256 _initialSupply) {
        name = _name;
        symbol = _symbol;
        totalSupply = _initialSupply;
        balanceOf[msg.sender] = totalSupply;
        emit Transfer(address(0), msg.sender, totalSupply);
    }

    function transfer(address to, uint256 value) public returns (bool) {
        require(balanceOf[msg.sender] >= value, "Insufficient balance");
        
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        emit Transfer(msg.sender, to, value);
        return true;
    }
}
`;

// Constructor arguments for the token
const constructorArgs = ["Monad Test Token", "MTT", 1000000];

async function testDeploy() {
    console.log("Testing deploy-contract tool with a simple token contract...");
    
    try {
        // Call the deploy-contract tool directly
        const result = await tools["deploy-contract"]({
            sourceCode,
            constructorArgs,
            contractName: "BasicToken",
            saveArtifacts: true
        });
        
        console.log("Deployment result:", result);
        
        if (result.success) {
            console.log("✓ Test passed! Contract deployed successfully.");
            console.log(`Contract address: ${result.address}`);
            console.log(`Explorer URL: ${result.explorerUrl}`);
        } else {
            console.error("✗ Test failed:", result.error);
        }
    } catch (error) {
        console.error("✗ Test failed with exception:", error.message);
    }
}

// Run the test
testDeploy().catch(console.error); 