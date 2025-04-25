#!/usr/bin/env node

/**
 * FORCE-SOLC MCP Plugin for Claude
 * Always uses local Solidity 0.8.28 for compilation, ignoring pragma in source
 */

// Force CommonJS mode with .cjs extension
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

// IMPORTANT: Redirect console.log to stderr before anything else
const originalConsoleLog = console.log;
console.log = function() {
  console.error.apply(console, arguments);
};

// Log to stderr only to avoid MCP parsing errors
function log(message) {
  console.error(`[FORCE-SOLC] ${message}`);
}

// IMPORTANT: Use the exact local solc 0.8.28 installation
let solc;
try {
  // Explicitly load the local solc from node_modules
  const solcPath = require.resolve('solc', { paths: [process.cwd()] });
  log(`Loading solc from: ${solcPath}`);
  solc = require(solcPath);
  
  // Verify its version
  const version = JSON.parse(solc.version());
  log(`Loaded solc version: ${version.compiler.version}`);
  
  if (version.compiler.version !== '0.8.28') {
    throw new Error(`Expected solc 0.8.28 but got ${version.compiler.version}`);
  }
} catch (error) {
  console.error(`[FORCE-SOLC] Failed to load local solc@0.8.28: ${error.message}`);
  console.error(`[FORCE-SOLC] Please run: npm install solc@0.8.28 --save-exact`);
  process.exit(1);
}

// Try to load private key from env.js
let PRIVATE_KEY;
try {
  const envFile = require('../env.js');
  PRIVATE_KEY = envFile.PRIVATE_KEY;
  if (PRIVATE_KEY) {
    const wallet = new ethers.Wallet(PRIVATE_KEY);
    log(`Loaded private key for address: ${wallet.address.substring(0, 6)}...${wallet.address.substring(38)}`);
  } else {
    log(`WARNING: PRIVATE_KEY is undefined in env.js`);
  }
} catch (error) {
  log(`WARNING: Failed to load env.js: ${error.message}`);
}

// Force Solidity version to 0.8.28 in source code
function forceVersion(source) {
  if (!source || typeof source !== 'string') {
    return "// SPDX-License-Identifier: MIT\npragma solidity 0.8.28;\n\ncontract SimpleStorage {\n    uint256 private value;\n    function setValue(uint256 _newValue) public { value = _newValue; }\n    function getValue() public view returns (uint256) { return value; }\n}";
  }
  
  // Replace any pragma version with 0.8.28
  const pragmaRegex = /pragma\s+solidity\s+([^;]+);/;
  const pragmaMatch = source.match(pragmaRegex);
  
  if (pragmaMatch) {
    const originalVersion = pragmaMatch[1];
    log(`Replacing Solidity version '${originalVersion}' with '0.8.28'`);
    return source.replace(pragmaRegex, 'pragma solidity 0.8.28;');
  } else {
    // No pragma found, add one at the top
    log('No pragma found, adding version 0.8.28');
    return `pragma solidity 0.8.28;\n\n${source}`;
  }
}

// Extract contract name from source
function extractContractName(source) {
  const contractMatch = source.match(/contract\s+([a-zA-Z0-9_]+)/);
  return contractMatch && contractMatch[1] ? contractMatch[1] : 'SimpleContract';
}

// Compile contract with local solc
function compileWithLocalSolc(source) {
  log('Compiling with local solc 0.8.28...');
  
  try {
    // Prepare compilation input (exactly as expected by solc.compile)
    const input = {
      language: 'Solidity',
      sources: { 
        'Contract.sol': { content: source } 
      },
      settings: {
        outputSelection: {
          '*': { '*': ['abi', 'evm.bytecode.object'] }
        },
        optimizer: { enabled: true, runs: 200 }
      }
    };
    
    // Convert input to JSON string
    const inputJSON = JSON.stringify(input);
    
    // Compile using local solc
    const outputJSON = solc.compile(inputJSON);
    
    // Parse output
    const output = JSON.parse(outputJSON);
    
    // Check for errors
    if (output.errors && output.errors.some(e => e.severity === 'error')) {
      const errors = output.errors.filter(e => e.severity === 'error');
      log(`Compilation failed with ${errors.length} error(s):`);
      log(errors[0].formattedMessage || errors[0].message);
      return { success: false, error: errors[0].formattedMessage || errors[0].message };
    }
    
    // Get contract data
    const contracts = output.contracts['Contract.sol'];
    if (!contracts || Object.keys(contracts).length === 0) {
      return { success: false, error: 'No contracts found in compilation output' };
    }
    
    // Get the first contract if multiple were defined
    const contractName = Object.keys(contracts)[0];
    const contract = contracts[contractName];
    
    log(`Successfully compiled contract: ${contractName}`);
    
    return {
      success: true,
      contractName: contractName,
      abi: contract.abi,
      bytecode: '0x' + contract.evm.bytecode.object
    };
  } catch (error) {
    log(`Compilation error: ${error.message}`);
    return { success: false, error: `Compilation failed: ${error.message}` };
  }
}

// Compile and deploy contract
async function compileAndDeploy(sourceCode, constructorArgs = []) {
  if (!PRIVATE_KEY) {
    return { success: false, error: "No private key found in env.js" };
  }
  
  // Force correct version
  const fixedSource = forceVersion(sourceCode);
  const contractName = extractContractName(fixedSource);
  log(`Preparing to compile contract '${contractName}' with Solidity 0.8.28`);
  
  try {
    // Compile with local solc
    const compilationResult = compileWithLocalSolc(fixedSource);
    
    if (!compilationResult.success) {
      return compilationResult;
    }
    
    const { abi, bytecode } = compilationResult;
    
    // Deploy contract
    try {
      log('Deploying to Monad testnet...');
      const provider = new ethers.JsonRpcProvider('https://testnet-rpc.monad.xyz');
      const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
      
      // Deploy contract
      const factory = new ethers.ContractFactory(abi, bytecode, wallet);
      log('Broadcasting transaction...');
      
      const deployedContract = await factory.deploy(...constructorArgs);
      const txHash = deployedContract.deploymentTransaction().hash;
      log(`Transaction hash: ${txHash}`);
      
      // Wait for confirmation
      log('Waiting for confirmation...');
      const receipt = await deployedContract.deploymentTransaction().wait();
      
      if (!receipt || !deployedContract.target) {
        throw new Error('Deployment failed - no contract address returned');
      }
      
      const address = deployedContract.target;
      log(`✅ Contract deployed at: ${address}`);
      
      // Return success with deployed data
      return {
        success: true,
        address: address,
        transactionHash: txHash,
        abi: abi,
        contractName: compilationResult.contractName,
        explorerUrl: `https://explorer.testnet.monad.xyz/tx/${txHash}`
      };
    } catch (error) {
      log(`Deployment error: ${error.message}`);
      return { success: false, error: `Deployment failed: ${error.message}` };
    }
  } catch (error) {
    log(`Unexpected error: ${error.message}`);
    return { success: false, error: `Unexpected error: ${error.message}` };
  }
}

// Create the MCP server
const server = new McpServer({
  name: "monad-mcp",
  version: "1.0.0"
});

// Register the deploy-contract tool
server.tool(
  "deploy-contract",
  "Deploy a Solidity contract to Monad testnet (forces version 0.8.28)",
  {
    sourceCode: z.string().describe("Solidity source code (will be compiled with 0.8.28)"),
    constructorArgs: z.array(z.any()).optional().describe("Constructor arguments"),
    contractName: z.string().optional().describe("Contract name (optional)")
  },
  async (input) => {
    log("Received deploy-contract request");
    
    try {
      // Validate input
      if (!input || !input.sourceCode) {
        log("Missing source code in request");
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({
              success: false,
              error: "Missing source code in request"
            })
          }]
        };
      }
      
      // Get constructor args if provided
      const constructorArgs = input.constructorArgs || [];
      
      // Compile and deploy
      const result = await compileAndDeploy(input.sourceCode, constructorArgs);
      
      // Return result as JSON
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify(result)
        }]
      };
    } catch (error) {
      log(`Error processing request: ${error.message}`);
      
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({
            success: false,
            error: `Server error: ${error.message}`
          })
        }]
      };
    }
  }
);

// Override stdout.write to ensure only valid JSON is output
const originalStdoutWrite = process.stdout.write;
process.stdout.write = function(chunk, encoding, callback) {
  if (typeof chunk === 'string') {
    try {
      // Verify it's valid JSON
      JSON.parse(chunk);
      return originalStdoutWrite.apply(process.stdout, arguments);
    } catch (e) {
      // Not valid JSON, redirect to stderr
      return process.stderr.write(`[INVALID JSON] ${chunk}\n`, encoding, callback);
    }
  }
  
  // Non-strings to stderr
  return process.stderr.write(chunk, encoding, callback);
};

// Start the server
async function main() {
  try {
    const transport = new StdioServerTransport();
    
    process.on('uncaughtException', (error) => {
      log(`Uncaught exception: ${error.message}`);
    });
    
    await server.connect(transport);
    log("FORCE-SOLC MCP plugin running - ALWAYS forcing Solidity 0.8.28");
  } catch (error) {
    log(`Fatal error: ${error.message}`);
    process.exit(1);
  }
}

// Run the server
main().catch(error => {
  log(`Fatal error: ${error.message}`);
  process.exit(1);
}); 