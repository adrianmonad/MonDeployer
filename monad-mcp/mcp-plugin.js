#!/usr/bin/env node

/**
 * Monad MCP Plugin for Claude
 * 
 * A simplified MCP plugin that deploys contracts to Monad with
 * consistent JSON responses to avoid parsing errors.
 */

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execPromise = promisify(exec);

// Import the version checking utilities
const { checkVersion, fixVersion } = require('../examples/check-contract-version');

// Helper function to safely log to stderr (for debugging)
function logDebug(message) {
  console.error(`DEBUG: ${message}`);
}

// Create a new MCP server
const server = new McpServer({
  name: "monad-mcp",
  version: "1.0.0",
});

// Register the deploy-contract tool
server.tool(
  "deploy-contract",
  "Compile and deploy a Solidity contract to the Monad testnet",
  {
    sourceCode: z.string().describe("The Solidity source code to compile and deploy (MUST use pragma solidity 0.8.28)"),
    constructorArgs: z.array(z.any()).optional().describe("Arguments for the contract constructor"),
    contractName: z.string().optional().describe("Name of the contract (if not provided, will be extracted from the source)"),
    saveArtifacts: z.boolean().optional().default(true).describe("Whether to save contract artifacts for later use"),
  },
  async (input) => {
    try {
      logDebug("Starting contract deployment process...");
      
      // Basic input validation
      if (!input || typeof input !== 'object' || !input.sourceCode) {
        logDebug("Invalid input received");
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({
              success: false,
              error: "Invalid input: source code is required"
            })
          }]
        };
      }
      
      // Check and fix the Solidity version
      const versionCheck = checkVersion(input.sourceCode);
      
      if (!versionCheck.valid) {
        logDebug(`Invalid Solidity version: ${versionCheck.currentVersion || 'not specified'}`);
        
        // Auto-fix the version
        logDebug("Auto-fixing Solidity version to 0.8.28");
        input.sourceCode = fixVersion(input.sourceCode);
        
        // Let the user know we fixed it
        logDebug("Source code updated with correct Solidity version");
      }
      
      // Create a temporary file with the source code
      const tempDir = path.resolve(__dirname, '../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const tempFile = path.join(tempDir, 'temp-contract.js');
      
      // Create a script that will handle the deployment
      const scriptContent = `
      const fs = require('fs');
      const path = require('path');
      
      // Contract source and details
      const CONTRACT_SOURCE = ${JSON.stringify(input.sourceCode)};
      const CONTRACT_NAME = ${input.contractName ? JSON.stringify(input.contractName) : 'null'};
      const CONSTRUCTOR_ARGS = ${JSON.stringify(input.constructorArgs || [])};
      
      // Load the deployment script from examples
      const deployer = require('../examples/deploy-contract-clean.js');
      
      // Override the source and arguments
      const origDeployContract = deployer.deployContract;
      deployer.deployContract = async function() {
        // The clean deployer already handles JSON formatting properly
        // and logs only valid JSON to stdout
        global.CONTRACT_SOURCE = CONTRACT_SOURCE;
        global.CONTRACT_NAME = CONTRACT_NAME;
        global.CONSTRUCTOR_ARGS = CONSTRUCTOR_ARGS;
        await origDeployContract();
      };
      
      // Execute the deployment
      deployer.deployContract();
      `;
      
      fs.writeFileSync(tempFile, scriptContent);
      
      // Execute the deployment script
      logDebug("Executing deployment script");
      const { stdout, stderr } = await execPromise(`node "${tempFile}"`);
      
      // Clean up
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
      
      // Parse the output and return a properly formatted JSON
      try {
        // Extract only valid JSON output from stdout
        let result;
        const jsonLines = stdout.split('\n').filter(line => {
          try {
            if (line.trim().startsWith('{')) {
              JSON.parse(line.trim());
              return true;
            }
            return false;
          } catch {
            return false;
          }
        });
        
        if (jsonLines.length > 0) {
          // Get the last JSON object (the result of deployment)
          result = JSON.parse(jsonLines[jsonLines.length - 1]);
        } else {
          result = { 
            success: false, 
            error: "No valid JSON result found in output" 
          };
        }
        
        logDebug(`Deployment ${result.success ? 'succeeded' : 'failed'}`);
        
        // Return the result in properly formatted MCP response
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify(result)
          }]
        };
      } catch (error) {
        logDebug(`Error parsing output: ${error.message}`);
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({
              success: false,
              error: `Failed to parse deployment result: ${error.message}`
            })
          }]
        };
      }
    } catch (error) {
      logDebug(`Execution error: ${error.message}`);
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({
            success: false,
            error: `Deployment failed: ${error.message}`
          })
        }]
      };
    }
  }
);

// Start the MCP server
async function main() {
  try {
    const transport = new StdioServerTransport();
    
    // Override console.log to use stderr for debug info
    const originalConsoleLog = console.log;
    console.log = (...args) => {
      // For proper MCP protocol, only output JSON responses to stdout
      if (typeof args[0] === 'string' && 
          (args[0].startsWith('{') || args[0].startsWith('['))) {
        originalConsoleLog(...args);
      } else {
        console.error(...args);
      }
    };
    
    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      console.log(JSON.stringify({
        success: false,
        error: `Uncaught error: ${error.message}`
      }));
    });
    
    await server.connect(transport);
    logDebug("Monad MCP plugin running");
  } catch (error) {
    console.error("Error starting MCP server:", error);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
}); 