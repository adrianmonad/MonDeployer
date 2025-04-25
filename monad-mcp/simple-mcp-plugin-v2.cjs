#!/usr/bin/env node

/**
 * ENHANCED Monad MCP Plugin for Claude
 * Performs actual contract deployments with proper JSON handling
 * ALWAYS uses Solidity 0.8.28 regardless of pragma version
 */

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const { ethers } = require('ethers');

// Explicitly use solc 0.8.28 - either from local install or as fallback
let solc;
try {
  // First try to load from the direct dependency
  const solcPath = require.resolve('solc');
  solc = require(solcPath);
  console.error(`[INFO] Loaded solc from: ${solcPath}`);
  
  // Verify version
  const solcVersion = JSON.parse(solc.version()).replace(/[^0-9.]/g, '');
  console.error(`[INFO] Loaded solc version: ${solcVersion}`);
  
  if (!solcVersion.startsWith('0.8.28')) {
    console.error('[WARN] Local solc is not 0.8.28, will use remote version');
    // Will fall back to loadRemoteVersion later
  }
} catch (error) {
  console.error(`[WARN] Failed to load local solc: ${error.message}`);
  // Will fall back to loadRemoteVersion later
  solc = require('solc');
}

const execPromise = promisify(exec);

// IMPORTANT: Redirect ALL console.log to stderr before any code runs
const originalConsoleLog = console.log;
console.log = function() {
  console.error.apply(console, arguments);
};

// Patch stdout.write to ensure only valid JSON goes to stdout
const originalStdoutWrite = process.stdout.write;
process.stdout.write = function(chunk, encoding, callback) {
  // If it's a string, check if it's valid JSON
  if (typeof chunk === 'string') {
    try {
      // Test if it parses as JSON
      JSON.parse(chunk);
      // It's valid JSON, let it through to stdout
      return originalStdoutWrite.apply(process.stdout, arguments);
    } catch (e) {
      // Not valid JSON, redirect to stderr
      return process.stderr.write(chunk, encoding, callback);
    }
  }
  
  // For non-strings, write to stderr to be safe
  return process.stderr.write(chunk, encoding, callback);
};

// Try to load private key from env.js
let PRIVATE_KEY;
try {
  const envFile = require('../env.js');
  PRIVATE_KEY = envFile.PRIVATE_KEY;
  if (PRIVATE_KEY) {
    console.error(`[INFO] Loaded private key from env.js (address: ${maskAddress(PRIVATE_KEY)})`);
  } else {
    console.error(`[WARN] Private key is undefined in env.js`);
  }
} catch (error) {
  console.error(`[WARN] Failed to load env.js: ${error.message}`);
}

// Mask address for logging
function maskAddress(privateKey) {
  try {
    // Create wallet from private key
    const wallet = new ethers.Wallet(privateKey);
    const address = wallet.address;
    
    // Mask the address for safety
    return address.substring(0, 6) + '...' + address.substring(38);
  } catch (error) {
    return 'invalid-key';
  }
}

// ERC20 ABI - only what we need for transfers
const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

/**
 * Send tokens to multiple recipients
 */
async function sendTokens(tokenAddress, recipients, amount) {
  try {
    console.error(`[INFO] Sending tokens from contract: ${tokenAddress}`);
    
    if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
      throw new Error(`Invalid token address: ${tokenAddress}`);
    }
    
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      throw new Error('Recipients must be a non-empty array of addresses');
    }
    
    // Validate each recipient address
    for (const recipient of recipients) {
      if (!ethers.isAddress(recipient)) {
        throw new Error(`Invalid recipient address: ${recipient}`);
      }
    }
    
    if (amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }
    
    // Set up provider and wallet
    const provider = new ethers.JsonRpcProvider('https://testnet-rpc.monad.xyz');
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    // Create contract instance
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    
    // Get token info for better logging
    try {
      const symbol = await tokenContract.symbol();
      const decimals = await tokenContract.decimals();
      const formattedAmount = ethers.formatUnits(amount, decimals);
      console.error(`[INFO] Sending ${formattedAmount} ${symbol} to ${recipients.length} recipients`);
    } catch (error) {
      console.error(`[WARN] Could not get token info: ${error.message}`);
    }
    
    // Send tokens to each recipient
    const results = [];
    for (const recipient of recipients) {
      try {
        console.error(`[INFO] Sending tokens to ${recipient}`);
        
        const tx = await tokenContract.transfer(recipient, amount);
        console.error(`[INFO] Transaction hash: ${tx.hash}`);
        
        // Wait for confirmation
        console.error('[INFO] Waiting for confirmation...');
        const receipt = await tx.wait();
        
        console.error(`[INFO] ✅ Transfer to ${recipient} confirmed in tx: ${receipt.hash}`);
        
        results.push({
          to: recipient,
          txHash: receipt.hash
        });
      } catch (error) {
        console.error(`[ERROR] Failed to send tokens to ${recipient}: ${error.message}`);
        results.push({
          to: recipient,
          error: error.message
        });
      }
    }
    
    // Check if any transfers succeeded
    const successful = results.filter(r => r.txHash);
    const failed = results.filter(r => r.error);
    
    if (successful.length === 0) {
      throw new Error('All transfers failed');
    }
    
    return {
      success: true,
      sent: results.filter(r => r.txHash),
      failed: failed.length > 0 ? failed : undefined
    };
  } catch (error) {
    console.error(`[ERROR] Token transfer error: ${error.message}`);
    throw error;
  }
}

/**
 * Force Solidity version 0.8.28 in a contract source
 */
function forceCorrectVersion(source) {
  if (!source || typeof source !== 'string') {
    return "// SPDX-License-Identifier: MIT\npragma solidity 0.8.28;\n\ncontract SimpleStorage {\n    uint256 private value;\n    \n    event ValueChanged(uint256 newValue);\n    \n    function setValue(uint256 _newValue) public {\n        value = _newValue;\n        emit ValueChanged(_newValue);\n    }\n    \n    function getValue() public view returns (uint256) {\n        return value;\n    }\n}";
  }
  
  // Replace ANY solidity version with 0.8.28
  let result = source;
  
  // Check if there's a pragma statement and replace it
  const pragmaMatch = source.match(/pragma\s+solidity\s+([^;]+);/);
  if (pragmaMatch) {
    result = source.replace(/pragma\s+solidity\s+([^;]+);/, 'pragma solidity 0.8.28;');
    console.error(`[INFO] Replaced version ${pragmaMatch[1]} with 0.8.28`);
  } else {
    // Add pragma statement after SPDX license or at the beginning
    const spdxMatch = source.match(/(\/\/\s*SPDX-License-Identifier:[^\n]+\n)/);
    if (spdxMatch) {
      result = source.replace(spdxMatch[0], `${spdxMatch[0]}\npragma solidity 0.8.28;\n`);
      console.error("[INFO] Added version after SPDX");
    } else {
      result = `pragma solidity 0.8.28;\n\n${source}`;
      console.error("[INFO] Added version at beginning");
    }
  }
  
  return result;
}

/**
 * Helper function to detect and extract the contract name from source
 */
function extractContractName(source) {
  // Try to find a contract declaration
  const contractMatch = source.match(/contract\s+([a-zA-Z0-9_]+)/);
  if (contractMatch && contractMatch[1]) {
    return contractMatch[1];
  }
  
  // Fallback to 'SimpleContract'
  return 'SimpleContract';
}

// Compile and deploy contract function
async function compileAndDeployContract(sourceCode, constructorArgs = []) {
  console.error("[INFO] Starting compilation and deployment...");
  
  if (!PRIVATE_KEY) {
    return {
      success: false,
      error: "No private key found in env.js"
    };
  }
  
  // Fix Solidity version
  const fixedSource = forceCorrectVersion(sourceCode);
  
  // Extract contract name for better logs
  const contractName = extractContractName(fixedSource);
  console.error(`[INFO] Detected contract name: ${contractName}`);
  
  try {
    // Compile using solc
    console.error("[INFO] Compiling with Solidity 0.8.28...");
    const input = {
      language: 'Solidity',
      sources: {
        [`${contractName}.sol`]: { content: fixedSource }
      },
      settings: {
        outputSelection: {
          '*': { '*': ['abi', 'evm.bytecode.object'] }
        },
        optimizer: { enabled: true, runs: 200 }
      }
    };
    
    // Compile using either local or remote compiler
    return new Promise((resolve, reject) => {
      // Determine if we can use local compiler
      const solcVersion = solc.version ? JSON.parse(solc.version()).replace(/[^0-9.]/g, '') : null;
      const useLocalCompiler = solcVersion && solcVersion.startsWith('0.8.28');
      
      const compileWithSolc = (compiler) => {
        try {
          // Compile the contract
          const output = JSON.parse(compiler.compile(JSON.stringify(input)));
          
          // Check for compilation errors
          if (output.errors && output.errors.some(e => e.severity === 'error')) {
            const errors = output.errors.filter(e => e.severity === 'error');
            console.error(`[ERROR] Compilation errors: ${errors.length} found`);
            return resolve({
              success: false,
              error: `Compilation failed with ${errors.length} errors: ${errors[0].message}`
            });
          }
          
          // Get compiled data
          const contractFile = Object.keys(output.contracts[`${contractName}.sol`])[0] || contractName;
          const contract = output.contracts[`${contractName}.sol`][contractFile];
          
          if (!contract) {
            console.error(`[ERROR] No contract found in compiled output`);
            return resolve({
              success: false,
              error: 'No contract found in compiled output'
            });
          }
          
          const abi = contract.abi;
          const bytecode = '0x' + contract.evm.bytecode.object;
          
          console.error(`[INFO] Contract compiled successfully: ${contractFile}`);
          
          // Deploy using ethers
          deployContract(abi, bytecode, contractFile, constructorArgs)
            .then(result => resolve(result))
            .catch(error => {
              console.error(`[ERROR] Deployment error: ${error.message}`);
              resolve({
                success: false,
                error: `Deployment failed: ${error.message}`
              });
            });
        } catch (error) {
          console.error(`[ERROR] Compilation error: ${error.message}`);
          return resolve({
            success: false,
            error: `Compilation failed: ${error.message}`
          });
        }
      };
      
      // Use appropriate compiler
      if (useLocalCompiler) {
        console.error('[INFO] Using local Solidity 0.8.28 compiler');
        compileWithSolc(solc);
      } else {
        console.error('[INFO] Loading remote Solidity 0.8.28 compiler');
        solc.loadRemoteVersion('v0.8.28', (err, solcSnapshot) => {
          if (err) {
            console.error(`[ERROR] Failed to load compiler: ${err.message}`);
            return resolve({
              success: false,
              error: `Failed to load compiler: ${err.message}`
            });
          }
          
          compileWithSolc(solcSnapshot);
        });
      }
    });
  } catch (error) {
    console.error(`[ERROR] Unexpected error: ${error.message}`);
    return {
      success: false,
      error: `Unexpected error: ${error.message}`
    };
  }
}

// Deploy contract using ethers
async function deployContract(abi, bytecode, contractName, constructorArgs) {
  try {
    console.error('[INFO] Deploying contract to Monad testnet...');
    
    // Set up provider and wallet
    const provider = new ethers.JsonRpcProvider('https://testnet-rpc.monad.xyz');
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    // Deploy contract
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);
    console.error('[INFO] Broadcasting transaction...');
    
    const deployedContract = await factory.deploy(...constructorArgs);
    console.error(`[INFO] Transaction hash: ${deployedContract.deploymentTransaction().hash}`);
    
    // Wait for deployment
    console.error('[INFO] Waiting for confirmation...');
    const receipt = await deployedContract.deploymentTransaction().wait();
    
    if (!receipt || !deployedContract.target) {
      throw new Error('Deployment failed - no contract address returned');
    }
    
    console.error(`[INFO] ✅ Contract deployed at: ${deployedContract.target}`);
    
    // Return success result
    return {
      success: true,
      address: deployedContract.target,
      transactionHash: deployedContract.deploymentTransaction().hash,
      abi: abi,
      contractName: contractName,
      explorerUrl: `https://explorer.testnet.monad.xyz/tx/${deployedContract.deploymentTransaction().hash}`
    };
  } catch (error) {
    console.error(`[ERROR] Deployment error: ${error.message}`);
    throw error;
  }
}

// Create an MCP server with the deploy-contract tool
const server = new McpServer({
  name: "monad-mcp-v2",
  version: "1.0.0",
});

// Set up deploy-contract tool for real deployments
server.tool(
  "deploy-contract",
  "Deploy a Solidity contract to Monad testnet (real deployment)",
  {
    sourceCode: z.string().describe("Solidity source code"),
    constructorArgs: z.array(z.any()).optional().describe("Constructor arguments"),
    contractName: z.string().optional().describe("Contract name")
  },
  async (input) => {
    console.error("[INFO] Received deploy-contract request");
    
    try {
      // Validate input
      if (!input || !input.sourceCode) {
        const errorResponse = {
          success: false,
          error: "Missing sourceCode in request"
        };
        
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify(errorResponse)
          }]
        };
      }
      
      // Use constructor args if provided
      const constructorArgs = input.constructorArgs || [];
      
      // Deploy the contract for real
      const result = await compileAndDeployContract(input.sourceCode, constructorArgs);
      
      // Return the result
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify(result)
        }]
      };
    } catch (error) {
      console.error(`[ERROR] Deployment failed: ${error.message}`);
      
      const errorResponse = {
        success: false,
        error: `Deployment failed: ${error.message}`
      };
      
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify(errorResponse)
        }]
      };
    }
  }
);

// Register the token transfer tool with a different name
server.tool(
  "transfer-erc20",
  "Send ERC20 tokens to multiple recipients on Monad testnet",
  {
    tokenAddress: z.string().describe("The ERC20 token contract address"),
    recipients: z.array(z.string()).describe("Array of wallet addresses to receive tokens"),
    amount: z.string().or(z.number()).describe("Amount of tokens to send to each recipient")
  },
  async (input) => {
    console.error("[INFO] Received token transfer request");
    
    try {
      // Validate input
      if (!input || !input.tokenAddress || !input.recipients || input.amount === undefined) {
        const errorResponse = {
          success: false,
          error: "Missing required parameters: tokenAddress, recipients, and amount"
        };
        
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify(errorResponse)
          }]
        };
      }
      
      // Convert amount to BigInt if it's a string (for handling large numbers)
      let amount = input.amount;
      if (typeof amount === 'string') {
        try {
          // If it's a string with scientific notation or decimal, parse it
          if (amount.includes('e') || amount.includes('.')) {
            amount = ethers.parseUnits(amount, 18); // Default to 18 decimals
          } else {
            amount = BigInt(amount);
          }
        } catch (error) {
          return {
            content: [{ 
              type: "text", 
              text: JSON.stringify({
                success: false,
                error: `Invalid amount format: ${error.message}`
              })
            }]
          };
        }
      }
      
      // Send the tokens
      const result = await sendTokens(input.tokenAddress, input.recipients, amount);
      
      // Return the result
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify(result)
        }]
      };
    } catch (error) {
      console.error(`[ERROR] Token transfer failed: ${error.message}`);
      
      const errorResponse = {
        success: false,
        error: `Token transfer failed: ${error.message}`
      };
      
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify(errorResponse)
        }]
      };
    }
  }
);

// Start the server
async function main() {
  try {
    const transport = new StdioServerTransport();
    
    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      console.error(`[ERROR] Uncaught error: ${error.message}`);
    });
    
    // Add debug logging for tool registration
    console.error(`[DEBUG] Registered tools: deploy-contract, transfer-erc20`);
    console.error(`[DEBUG] MCP server version 2 with alternative tool names`);
    
    await server.connect(transport);
    console.error("[INFO] Enhanced Monad MCP plugin V2 running - ALWAYS using Solidity 0.8.28");
  } catch (error) {
    console.error(`[ERROR] Fatal error: ${error.message}`);
    process.exit(1);
  }
}

// Run the server
main().catch(error => {
  console.error(`[ERROR] Fatal error: ${error.message}`);
  process.exit(1);
}); 