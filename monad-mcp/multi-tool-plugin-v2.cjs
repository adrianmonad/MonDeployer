#!/usr/bin/env node

/**
 * IMPROVED MULTI-TOOL Monad MCP Plugin for Claude
 * With completely independent tools for contract deployment and token transfers
 * Each tool initializes its own wallet to prevent interference
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

// Create the MCP server with multiple independent tools
const server = new McpServer({
  name: "monad-mcp",
  version: "1.0.0"
});

// =====================================================================
// DEPLOY CONTRACT TOOL - Completely independent implementation
// =====================================================================

// Get solc version safely for deploy-contract
let solcVersion = "unknown";
try {
  const versionJson = solc.version();
  log(`[DEPLOY] Raw solc version: ${versionJson}`);
  
  if (typeof versionJson === 'string') {
    try {
      const parsed = JSON.parse(versionJson);
      solcVersion = parsed.compiler?.version || "unknown";
    } catch (e) {
      // Handle potential JSON parse errors
      log(`[DEPLOY] Cannot parse version JSON: ${e.message}`);
      
      // Try to extract version via regex if possible
      const match = versionJson.match(/version: ['"]([^'"]+)['"]/);
      if (match) solcVersion = match[1];
    }
  }
  log(`[DEPLOY] Using solc version: ${solcVersion}`);
} catch (error) {
  log(`[DEPLOY] Error getting solc version: ${error.message}`);
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
    log(`[DEPLOY] Replacing Solidity version '${originalVersion}' with '0.8.28'`);
    return source.replace(pragmaRegex, 'pragma solidity 0.8.28;');
  } else {
    // No pragma found, add one at the top
    log('[DEPLOY] No pragma found, adding version 0.8.28');
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
  log(`[DEPLOY] Compiling contract: ${contractName || 'Unknown'}`);
  
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
        log(`[DEPLOY] Compilation errors: ${errorMessages}`);
        throw new Error(`Compilation failed: ${errorMessages}`);
      }
      
      // Just warnings, continue
      log(`[DEPLOY] Compilation warnings: ${output.errors.length}`);
    }
    
    // Find the contract
    const compiledContract = output.contracts['contract.sol'][contractName];
    if (!compiledContract) {
      // Try to find any contract if the named one wasn't found
      const contractKey = Object.keys(output.contracts['contract.sol'])[0];
      if (!contractKey) {
        throw new Error('No compiled contracts found');
      }
      log(`[DEPLOY] Contract ${contractName} not found, using ${contractKey} instead`);
      return output.contracts['contract.sol'][contractKey];
    }
    
    return compiledContract;
  } catch (error) {
    log(`[DEPLOY] Compilation error: ${error.message}`);
    throw error;
  }
}

// Deploy contract
async function deployContract(source, constructorArgs = []) {
  try {
    // Load fresh private key and RPC from env.js within the deploy function
    let PRIVATE_KEY;
    let RPC_URL = "https://testnet-rpc.monad.xyz"; // Monad testnet RPC URL
    let CHAIN_ID = 10143; // Monad testnet chain ID
    
    try {
      const envFile = require('../env.js');
      PRIVATE_KEY = envFile.PRIVATE_KEY;
      if (envFile.RPC_URL) {
        RPC_URL = envFile.RPC_URL;
        log(`[DEPLOY] Using RPC URL from env.js: ${RPC_URL}`);
      }
      
      if (!PRIVATE_KEY) {
        throw new Error("No private key found in env.js");
      }
    } catch (error) {
      throw new Error(`Failed to load env.js: ${error.message}`);
    }
    
    // Initialize fresh provider and wallet just for this deployment
    const provider = new ethers.JsonRpcProvider(RPC_URL, {
      chainId: CHAIN_ID,
      name: 'monad-testnet'
    });
    
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    log(`[DEPLOY] Initialized wallet with address: ${wallet.address.substring(0, 6)}...${wallet.address.substring(38)}`);
    
    const fixedSource = forceVersion(source);
    const contractName = extractContractName(fixedSource);
    log(`[DEPLOY] Deploying contract: ${contractName} with ${constructorArgs.length} constructor args`);
    
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
    
    log(`[DEPLOY] Contract ABI has ${abi.length} functions, bytecode length: ${bytecode.length}`);
    
    // Create contract factory
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);
    
    // Deploy the contract with constructor arguments
    log(`[DEPLOY] Deploying with account: ${wallet.address}`);
    const deployedContract = await factory.deploy(...constructorArgs);
    
    log(`[DEPLOY] Contract deployment transaction sent: ${deployedContract.deploymentTransaction().hash}`);
    log(`[DEPLOY] Waiting for deployment confirmation...`);
    
    // Wait for deployment
    const receipt = await deployedContract.deploymentTransaction().wait();
    
    const contractAddress = deployedContract.target;
    const transactionHash = receipt.hash;
    
    log(`[DEPLOY] ✅ Contract deployed at: ${contractAddress}`);
    log(`[DEPLOY] Transaction hash: ${transactionHash}`);
    
    return {
      success: true,
      address: contractAddress,
      transactionHash: transactionHash,
      abi: abi,
      contractName: contractName,
      explorerUrl: `https://explorer.testnet.monad.xyz/tx/${transactionHash}`
    };
  } catch (error) {
    log(`[DEPLOY] ❌ Deployment error: ${error.message}`);
    throw error;
  }
}

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
    log("[DEPLOY] Received deploy-contract request");
    
    try {
      // Validate input
      if (!input || !input.sourceCode) {
        log("[DEPLOY] Missing source code in request");
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
      log(`[DEPLOY] Error processing request: ${error.message}`);
      
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

// =====================================================================
// SEND TOKEN TOOL - Completely independent implementation
// =====================================================================

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
    // Load fresh private key and RPC from env.js within the send tokens function
    let PRIVATE_KEY;
    let RPC_URL = "https://testnet-rpc.monad.xyz"; // Monad testnet RPC URL
    let CHAIN_ID = 10143; // Monad testnet chain ID
    
    try {
      const envFile = require('../env.js');
      PRIVATE_KEY = envFile.PRIVATE_KEY;
      if (envFile.RPC_URL) {
        RPC_URL = envFile.RPC_URL;
        log(`[TOKEN] Using RPC URL from env.js: ${RPC_URL}`);
      }
      
      if (!PRIVATE_KEY) {
        throw new Error("No private key found in env.js");
      }
    } catch (error) {
      throw new Error(`Failed to load env.js: ${error.message}`);
    }
    
    // Initialize fresh provider and wallet just for this token transfer
    const provider = new ethers.JsonRpcProvider(RPC_URL, {
      chainId: CHAIN_ID,
      name: 'monad-testnet'
    });
    
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    log(`[TOKEN] Initialized wallet with address: ${wallet.address.substring(0, 6)}...${wallet.address.substring(38)}`);
    
    log(`[TOKEN] Sending tokens from contract: ${tokenAddress}`);
    
    if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
      throw new Error(`Invalid token address: ${tokenAddress}`);
    }
    
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      throw new Error('Recipients must be a non-empty array of addresses');
    }
    
    // Normalize all recipient addresses to lowercase
    const normalizedRecipients = recipients.map(r => r.toLowerCase());
    log(`[TOKEN] Normalized ${recipients.length} recipient addresses to lowercase`);
    
    // Validate each recipient address with strict checks
    for (const recipient of normalizedRecipients) {
      // Check if it's a string
      if (typeof recipient !== 'string') {
        throw new Error(`Invalid recipient: ${recipient} - must be a string`);
      }
      
      // Check if it starts with 0x
      if (!recipient.startsWith('0x')) {
        throw new Error(`Invalid recipient: ${recipient} - must start with 0x`);
      }
      
      // Check address length
      if (recipient.length !== 42) {
        throw new Error(`Invalid recipient: ${recipient} - must be 42 characters long (including 0x prefix)`);
      }
      
      // Check if it's a valid address
      if (!ethers.isAddress(recipient)) {
        throw new Error(`Invalid recipient: ${recipient} - must be a valid EVM address`);
      }
    }
    
    if (amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }
    
    // Create contract instance using the fresh wallet
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    
    // Get token info for better logging
    try {
      const symbol = await tokenContract.symbol();
      const decimals = await tokenContract.decimals();
      const formattedAmount = ethers.formatUnits(amount, decimals);
      log(`[TOKEN] Sending ${formattedAmount} ${symbol} to ${recipients.length} recipients`);
      
      // Log sender balance to debug potential issues
      const senderBalance = await tokenContract.balanceOf(wallet.address);
      const formattedBalance = ethers.formatUnits(senderBalance, decimals);
      log(`[TOKEN] Sender balance: ${formattedBalance} ${symbol}`);
      
      if (senderBalance < amount * BigInt(recipients.length)) {
        log(`[TOKEN] WARNING: Balance may be insufficient for all transfers`);
      }
    } catch (error) {
      log(`[TOKEN] Could not get token info: ${error.message}`);
    }
    
    // Send tokens to each recipient
    const successful = [];
    const failed = [];
    
    for (const recipient of normalizedRecipients) {
      try {
        log(`[TOKEN] Sending tokens to ${recipient}`);
        
        // Preserve 0x prefix, do not modify the recipient address
        const tx = await tokenContract.transfer(recipient, amount);
        log(`[TOKEN] Transaction hash: ${tx.hash}`);
        
        // Wait for confirmation
        log('[TOKEN] Waiting for confirmation...');
        const receipt = await tx.wait();
        
        log(`[TOKEN] ✅ Transfer to ${recipient} confirmed in tx: ${receipt.hash}`);
        
        successful.push({
          to: recipient,
          txHash: receipt.hash
        });
      } catch (error) {
        log(`[TOKEN] ❌ Failed to send tokens to ${recipient}: ${error.message}`);
        failed.push({
          to: recipient,
          error: error.message
        });
      }
    }
    
    // Check if any transfers succeeded
    if (successful.length === 0) {
      throw new Error('All transfers failed');
    }
    
    return {
      success: true,
      sent: successful,
      failed: failed.length > 0 ? failed : undefined
    };
  } catch (error) {
    log(`[TOKEN] Token transfer error: ${error.message}`);
    throw error;
  }
}

// Register the send-token tool
server.tool(
  "send-token",
  "Send ERC20 tokens to multiple recipients on Monad testnet",
  {
    tokenAddress: z.string().describe("The ERC20 token contract address"),
    recipients: z.array(z.string()).describe("Array of wallet addresses to receive tokens"),
    amount: z.string().or(z.number()).describe("Amount of tokens to send to each recipient")
  },
  async (input) => {
    log("[TOKEN] Received send-token request");
    
    try {
      // Validate input
      if (!input || !input.tokenAddress || !input.recipients || input.amount === undefined) {
        log("[TOKEN] Missing required parameters");
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({
              success: false,
              error: "Missing required parameters: tokenAddress, recipients, and amount"
            })
          }]
        };
      }
      
      // Load fresh private key and RPC from env.js within the send tokens function
      let PRIVATE_KEY;
      let RPC_URL = "https://testnet-rpc.monad.xyz"; // Monad testnet RPC URL
      let CHAIN_ID = 10143; // Monad testnet chain ID
      
      try {
        const envFile = require('../env.js');
        PRIVATE_KEY = envFile.PRIVATE_KEY;
        if (envFile.RPC_URL) {
          RPC_URL = envFile.RPC_URL;
          log(`[TOKEN] Using RPC URL from env.js: ${RPC_URL}`);
        }
        
        if (!PRIVATE_KEY) {
          throw new Error("No private key found in env.js");
        }
      } catch (error) {
        throw new Error(`Failed to load env.js: ${error.message}`);
      }
      
      // Initialize fresh provider and wallet just for this token transfer
      const provider = new ethers.JsonRpcProvider(RPC_URL, {
        chainId: CHAIN_ID,
        name: 'monad-testnet'
      });
      
      const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
      log(`[TOKEN] Initialized wallet with address: ${wallet.address.substring(0, 6)}...${wallet.address.substring(38)}`);
      
      // Create token contract instance to get decimals
      const tokenContract = new ethers.Contract(input.tokenAddress, ERC20_ABI, wallet);
      
      // Get token decimals to properly format the amount
      log(`[TOKEN] Reading token decimals from contract ${input.tokenAddress}`);
      const decimals = await tokenContract.decimals();
      log(`[TOKEN] Token decimals: ${decimals}`);
      
      // Get token symbol for better logs
      let symbol = "UNKNOWN";
      try {
        symbol = await tokenContract.symbol();
        log(`[TOKEN] Token symbol: ${symbol}`);
      } catch (error) {
        log(`[TOKEN] Could not get token symbol: ${error.message}`);
      }
      
      // Convert amount to proper decimal representation
      let amount = input.amount;
      if (typeof amount === 'string' || typeof amount === 'number') {
        try {
          // Convert user-friendly amount to raw token amount with correct decimals
          amount = ethers.parseUnits(amount.toString(), decimals);
          log(`[TOKEN] Parsed amount with ${decimals} decimals: ${amount.toString()}`);
        } catch (error) {
          log(`[TOKEN] Invalid amount format: ${error.message}`);
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
      
      // Normalize all recipient addresses to lowercase
      const normalizedRecipients = input.recipients.map(r => r.toLowerCase());
      log(`[TOKEN] Normalized ${input.recipients.length} recipient addresses to lowercase`);
      
      // Check sender balance before proceeding
      const senderBalance = await tokenContract.balanceOf(wallet.address);
      const formattedBalance = ethers.formatUnits(senderBalance, decimals);
      log(`[TOKEN] Sender balance: ${formattedBalance} ${symbol}`);
      
      const totalNeeded = amount * BigInt(input.recipients.length);
      if (senderBalance < totalNeeded) {
        log(`[TOKEN] WARNING: Insufficient balance (${formattedBalance}) for all transfers. Need ${ethers.formatUnits(totalNeeded, decimals)} ${symbol}`);
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({
              success: false,
              error: `Insufficient token balance. You have ${formattedBalance} ${symbol} but need ${ethers.formatUnits(totalNeeded, decimals)} ${symbol} for all transfers.`
            })
          }]
        };
      }
      
      // Send tokens to each recipient
      const successful = [];
      const failed = [];
      
      for (const recipient of normalizedRecipients) {
        try {
          // Validate recipient
          if (typeof recipient !== 'string') {
            throw new Error(`Invalid recipient: must be a string`);
          }
          
          if (!recipient.startsWith('0x')) {
            throw new Error(`Invalid recipient: must start with 0x`);
          }
          
          if (recipient.length !== 42) {
            throw new Error(`Invalid recipient: must be 42 characters long (including 0x prefix)`);
          }
          
          if (!ethers.isAddress(recipient)) {
            throw new Error(`Invalid recipient: must be a valid EVM address`);
          }
          
          log(`[TOKEN] Sending ${ethers.formatUnits(amount, decimals)} ${symbol} to ${recipient}`);
          
          // Send the tokens
          const tx = await tokenContract.transfer(recipient, amount);
          log(`[TOKEN] Transaction hash: ${tx.hash}`);
          
          // Wait for confirmation
          log('[TOKEN] Waiting for confirmation...');
          const receipt = await tx.wait();
          
          log(`[TOKEN] ✅ Transfer of ${ethers.formatUnits(amount, decimals)} ${symbol} to ${recipient} confirmed in tx: ${receipt.hash}`);
          
          successful.push({
            to: recipient,
            amount: ethers.formatUnits(amount, decimals),
            symbol: symbol,
            txHash: receipt.hash,
            explorerUrl: `https://explorer.testnet.monad.xyz/tx/${receipt.hash}`
          });
        } catch (error) {
          log(`[TOKEN] ❌ Failed to send tokens to ${recipient}: ${error.message}`);
          failed.push({
            to: recipient,
            error: error.message
          });
        }
      }
      
      // Check if any transfers succeeded
      if (successful.length === 0 && failed.length > 0) {
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({
              success: false,
              error: 'All transfers failed',
              failed: failed
            })
          }]
        };
      }
      
      // Return the result
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({
            success: true,
            sent: successful,
            failed: failed.length > 0 ? failed : undefined
          })
        }]
      };
    } catch (error) {
      log(`[TOKEN] Token transfer failed: ${error.message}`);
      
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({
            success: false,
            error: `Token transfer failed: ${error.message}`
          })
        }]
      };
    }
  }
);

// Start the server
async function main() {
  try {
    const transport = new StdioServerTransport();
    
    process.on('uncaughtException', (error) => {
      log(`Uncaught exception: ${error.message}`);
    });
    
    log(`Registered tools: deploy-contract, send-token`);
    await server.connect(transport);
    log("MULTI-TOOL MCP plugin running with INDEPENDENT TOOLS - ALWAYS using Solidity 0.8.28");
    
    // Test connection to provider
    try {
      const provider = new ethers.JsonRpcProvider("https://testnet-rpc.monad.xyz");
      const network = await provider.getNetwork();
      const blockNumber = await provider.getBlockNumber();
      log(`Connected to network: ${network.name || network.chainId}, Block #${blockNumber}`);
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