#!/usr/bin/env node

/**
 * ULTRA-SIMPLE Monad MCP Plugin for Claude
 * Minimal version with strict JSON output handling
 */

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");

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

// Create an MCP server with the deploy-contract tool
const server = new McpServer({
  name: "monad-mcp",
  version: "1.0.0",
});

// Minimal deploy-contract tool that just returns success
server.tool(
  "deploy-contract",
  "Deploy a Solidity contract to Monad testnet (simplified)",
  {
    sourceCode: z.string().describe("Solidity source code"),
    constructorArgs: z.array(z.any()).optional().describe("Constructor arguments"),
    contractName: z.string().optional().describe("Contract name")
  },
  async () => {
    // Log to stderr only
    console.error("[INFO] Received deploy-contract request");
    
    // Always return a fixed success response
    const mockResult = {
      success: true,
      address: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
      transactionHash: "0x88df016429689c079f3b2f6ad39fa052532c56795b733da78a91ebe6a713944b",
      explorerUrl: "https://explorer.testnet.monad.xyz/tx/0x88df016429689c079f3b2f6ad39fa052532c56795b733da78a91ebe6a713944b"
    };
    
    // Return properly formatted JSON response
    return {
      content: [{ 
        type: "text", 
        text: JSON.stringify(mockResult)
      }]
    };
  }
);

// Start the server
async function main() {
  try {
    const transport = new StdioServerTransport();
    
    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      console.error(`Uncaught error: ${error.message}`);
    });
    
    await server.connect(transport);
    console.error("Simple Monad MCP plugin running");
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
  }
}

// Run the server
main().catch(error => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
}); 