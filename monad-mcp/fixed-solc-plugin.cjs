#!/usr/bin/env node

/**
 * IMPROVED Monad MCP Plugin for Claude
 * With real contract deployment
 */

// Basic requires only
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const solc = require('solc');

// IMPORTANT: Redirect console.log to stderr
const originalConsoleLog = console.log;
console.log = function() {
  console.error.apply(console, arguments);
};

// Simple logging
function log(message) {
  console.error(`[MCP] ${message}`);
}

// Get solc version safely
let solcVersion = "unknown";
try {
  const versionJson = solc.version();
  log(`Raw solc version: ${versionJson}`);
  
  if (typeof versionJson === 'string') {
    try {
      const parsed = JSON.parse(versionJson);
      solcVersion = parsed.compiler?.version || "unknown";
    } catch (e) {
      // Handle potential JSON parse errors
      log(`Cannot parse version JSON: ${e.message}`);
      
      // Try to extract version via regex if possible
      const match = versionJson.match(/version: ['"]([^'"]+)['"]/);
      if (match) solcVersion = match[1];
    }
  }
  log(`Using solc version: ${solcVersion}`);
} catch (error) {
  log(`Error getting solc version: ${error.message}`);
}

// Load RPC URL and private key from env.js
let PRIVATE_KEY;
let RPC_URL = "https://testnet-rpc.monad.xyz"; // Monad testnet RPC URL
let CHAIN_ID = 10143; // Monad testnet chain ID

try {
  const envFile = require('../env.js');
  PRIVATE_KEY = envFile.PRIVATE_KEY;
  if (envFile.RPC_URL) {
    RPC_URL = envFile.RPC_URL;
    log(`Using RPC URL from env.js: ${RPC_URL}`);
  } else {
    log(`Using default Monad testnet RPC URL: ${RPC_URL}`);
  }
  
  if (PRIVATE_KEY) {
    const wallet = new ethers.Wallet(PRIVATE_KEY);
    log(`Loaded private key for address: ${wallet.address.substring(0, 6)}...${wallet.address.substring(38)}`);
  } else {
    log(`WARNING: PRIVATE_KEY is undefined in env.js`);
  }
} catch (error) {
  log(`WARNING: Failed to load env.js: ${error.message}`);
}

// Setup provider and wallet
const provider = new ethers.JsonRpcProvider(RPC_URL, {
  chainId: CHAIN_ID,
  name: 'monad-testnet'
});

let wallet;

if (PRIVATE_KEY) {
  wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  log(`Initialized wallet with provider for Monad testnet (Chain ID: ${CHAIN_ID})`);
} else {
  // Create a random wallet for testing if no private key is available
  wallet = ethers.Wallet.createRandom().connect(provider);
  log(`WARNING: Created random wallet for testing: ${wallet.address}`);
}

// Force Solidity version 0.8.28 in source code
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

// Compile Solidity code using solc
function compileSolidity(source, contractName) {
  log(`Compiling contract: ${contractName || 'Unknown'}`);
  
  const input = {
    language: 'Solidity',
    sources: {
      'contract.sol': {
        content: source
      }
    },
    settings: {
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode']
        }
      },
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  };
  
  try {
    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    
    if (output.errors) {
      const hasErrors = output.errors.some(error => error.severity === 'error');
      if (hasErrors) {
        const errorMessages = output.errors.map(e => e.message).join('\n');
        log(`Compilation errors: ${errorMessages}`);
        throw new Error(`Compilation failed: ${errorMessages}`);
      }
      
      // Just warnings, continue
      log(`Compilation warnings: ${output.errors.length}`);
    }
    
    // Find the contract
    const compiledContract = output.contracts['contract.sol'][contractName];
    if (!compiledContract) {
      // Try to find any contract if the named one wasn't found
      const contractKey = Object.keys(output.contracts['contract.sol'])[0];
      if (!contractKey) {
        throw new Error('No compiled contracts found');
      }
      log(`Contract ${contractName} not found, using ${contractKey} instead`);
      return output.contracts['contract.sol'][contractKey];
    }
    
    return compiledContract;
  } catch (error) {
    log(`Compilation error: ${error.message}`);
    throw error;
  }
}

// Deploy contract
async function deployContract(source, constructorArgs = []) {
  const fixedSource = forceVersion(source);
  const contractName = extractContractName(fixedSource);
  log(`Deploying contract: ${contractName} with ${constructorArgs.length} constructor args`);
  
  try {
    // Compile the contract
    const compiledContract = compileSolidity(fixedSource, contractName);
    
    if (!compiledContract) {
      throw new Error('Compilation failed');
    }
    
    const abi = compiledContract.abi;
    const bytecode = compiledContract.evm.bytecode.object;
    
    if (!bytecode) {
      throw new Error('Bytecode is empty');
    }
    
    log(`Contract ABI has ${abi.length} functions, bytecode length: ${bytecode.length}`);
    
    // Create contract factory
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);
    
    // Deploy the contract with constructor arguments
    log(`Deploying with account: ${wallet.address}`);
    const deployedContract = await factory.deploy(...constructorArgs);
    
    log(`Contract deployment transaction sent: ${deployedContract.deploymentTransaction().hash}`);
    log(`Waiting for deployment confirmation...`);
    
    // Wait for deployment
    const receipt = await deployedContract.deploymentTransaction().wait();
    
    const contractAddress = deployedContract.target;
    const transactionHash = receipt.hash;
    
    log(`Contract deployed at: ${contractAddress}`);
    log(`Transaction hash: ${transactionHash}`);
    
    return {
      success: true,
      address: contractAddress,
      transactionHash: transactionHash,
      contractName: contractName,
      explorerUrl: `https://testnet.monadexplorer.com/address/${contractAddress}`
    };
  } catch (error) {
    log(`Deployment error: ${error.message}`);
    throw error;
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
  "Deploy a Solidity contract to Monad testnet",
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
      
      // Deploy contract
      const constructorArgs = input.constructorArgs || [];
      const result = await deployContract(input.sourceCode, constructorArgs);
      
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
    log("MCP plugin running with REAL CONTRACT DEPLOYMENT");
    
    // Test connection to provider
    try {
      const network = await provider.getNetwork();
      const blockNumber = await provider.getBlockNumber();
      log(`Connected to network: ${network.name || network.chainId}, Block #${blockNumber}`);
      
      const balance = await provider.getBalance(wallet.address);
      log(`Wallet balance: ${ethers.formatEther(balance)} ETH`);
    } catch (error) {
      log(`WARNING: Provider connection issue: ${error.message}`);
    }
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