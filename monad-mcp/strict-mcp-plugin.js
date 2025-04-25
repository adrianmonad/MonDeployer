#!/usr/bin/env node

/**
 * STRICT Monad MCP Plugin for Claude
 * Forces Solidity version 0.8.28 regardless of input
 */

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const util = require('util');

const execPromise = promisify(exec);

// IMPORTANT: Redirect all console.log to stderr before any SDK is loaded
// This ensures any startup messages from the SDK go to stderr, not stdout
const originalConsoleLog = console.log;
console.log = function() {
  console.error.apply(console, arguments);
};

// Only use this for valid JSON responses to stdout
function logJson(obj) {
  originalConsoleLog(JSON.stringify(obj));
}

// Log debug info to stderr
function logDebug(message) {
  console.error(`[DEBUG] ${message}`);
}

// Create a new MCP server
const server = new McpServer({
  name: "monad-mcp",
  version: "1.0.0",
});

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
    logDebug(`Replaced version ${pragmaMatch[1]} with 0.8.28`);
  } else {
    // Add pragma statement after SPDX license or at the beginning
    const spdxMatch = source.match(/(\/\/\s*SPDX-License-Identifier:[^\n]+\n)/);
    if (spdxMatch) {
      result = source.replace(spdxMatch[0], `${spdxMatch[0]}\npragma solidity 0.8.28;\n`);
      logDebug("Added version after SPDX");
    } else {
      result = `pragma solidity 0.8.28;\n\n${source}`;
      logDebug("Added version at beginning");
    }
  }
  
  return result;
}

// Simplified deploy contract function
async function deploySimpleStorageContract(contractSource) {
  logDebug("Deploying simplified contract...");
  
  // Create temporary contract file
  const tempDir = path.resolve(__dirname, '../temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const tempContractPath = path.join(tempDir, 'SimpleStorage.sol');
  fs.writeFileSync(tempContractPath, contractSource);
  
  try {
    // Run the deploy-simple-storage.js script
    logDebug("Running deployment script...");
    const { stdout, stderr } = await execPromise(`node ${path.resolve(__dirname, '../examples/deploy-simple-storage.js')}`);
    
    logDebug("Deployment output:");
    logDebug(stdout);
    
    if (stderr) {
      logDebug("Deployment stderr:");
      logDebug(stderr);
    }
    
    // Extract the deployed contract address
    const addressMatch = stdout.match(/Address: (0x[a-fA-F0-9]{40})/);
    const txHashMatch = stdout.match(/Transaction hash: (0x[a-fA-F0-9]{64})/);
    
    if (addressMatch && txHashMatch) {
      return {
        success: true,
        address: addressMatch[1],
        transactionHash: txHashMatch[1],
        explorerUrl: `https://explorer.testnet.monad.xyz/tx/${txHashMatch[1]}`
      };
    } else {
      return {
        success: false,
        error: "Failed to extract deployment details from output"
      };
    }
  } catch (error) {
    logDebug(`Deployment error: ${error.message}`);
    return {
      success: false,
      error: `Deployment failed: ${error.message}`
    };
  } finally {
    // Clean up
    try {
      fs.unlinkSync(tempContractPath);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

// Register the deploy-contract tool
server.tool(
  "deploy-contract",
  "Deploy a Solidity contract to Monad testnet (forces version 0.8.28)",
  {
    sourceCode: z.string().describe("The Solidity source code to deploy (will be forced to version 0.8.28)"),
    constructorArgs: z.array(z.any()).optional().describe("Constructor arguments (ignored in simple mode)"),
    contractName: z.string().optional().describe("Contract name (ignored in simple mode)")
  },
  async (input) => {
    try {
      logDebug("Starting deployment process");
      
      // Validate input
      if (!input || typeof input !== 'object') {
        const errorResponse = {
          success: false,
          error: "Invalid input"
        };
        
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify(errorResponse)
          }]
        };
      }
      
      // If source code is missing, use default SimpleStorage
      const sourceCode = input.sourceCode || 
        "// SPDX-License-Identifier: MIT\ncontract SimpleStorage {\n    uint256 private value;\n    function setValue(uint256 _value) public { value = _value; }\n    function getValue() public view returns (uint256) { return value; }\n}";
      
      // Force the correct Solidity version
      const fixedSource = forceCorrectVersion(sourceCode);
      
      // Deploy the contract
      logDebug("Deploying contract with fixed version");
      const result = await deploySimpleStorageContract(fixedSource);
      
      // Return the result
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify(result)
          }]
      };
    } catch (error) {
      logDebug(`Error: ${error.message}`);
      
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

// Patch the SDK's transport implementation to ensure only valid JSON goes to stdout
const originalWrite = process.stdout.write;
process.stdout.write = function(chunk, encoding, callback) {
  // If it's a string and not valid JSON, redirect to stderr
  if (typeof chunk === 'string') {
    try {
      // Only allow if it parses as JSON
      JSON.parse(chunk);
      return originalWrite.apply(process.stdout, arguments);
    } catch (e) {
      // Not valid JSON, redirect to stderr
      return process.stderr.write(chunk, encoding, callback);
    }
  }
  
  // For buffers and other types, just write to stderr to be safe
  return process.stderr.write(chunk, encoding, callback);
};

// Start the MCP server
async function main() {
  try {
    // Intercept all stdout writes at the lowest level
    const transport = new StdioServerTransport();
    
    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      // Don't use logJson here as it might cause more errors
      process.stderr.write(`Uncaught error: ${error.message}\n`);
    });
    
    // Connect transport
    await server.connect(transport);
    logDebug("STRICT Monad MCP plugin running");
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

// Run the server
main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
}); 