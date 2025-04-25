/**
 * Monad MCP Server - Get MON Balance Tool
 * 
 * This server only contains tools specific to Monad testnet functionality.
 * The get-wallet-activity tool has been moved to the goldrush-mcp-server.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createPublicClient, formatUnits, http } from "viem";
import { monadTestnet } from "viem/chains";
import { compileAndDeploy } from "./utils/contract-deployer.js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// 🔗 Create a public client to interact with the Monad testnet
const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(),
});

// 🚀 Initialize the MCP server with a name, version, and supported capabilities
const server = new McpServer({
  name: "monad-testnet",
  version: "0.0.1",
  capabilities: ["get-mon-balance", "deploy-contract"],
});

// 🛠️ Define the "get-mon-balance" tool
server.tool(
  "get-mon-balance",
  "Get MON balance for an address on Monad testnet",
  {
    address: z.string().describe("Monad testnet address to check balance for"),
  },
  async ({ address }) => {
    try {
      const balance = await publicClient.getBalance({
        address: address as `0x${string}`,
      });

      return {
        content: [
          {
            type: "text",
            text: `✅ Balance for ${address}: ${formatUnits(balance, 18)} MON`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Error fetching balance: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
        isError: true,
      };
    }
  }
);

// 🛠️ Define the "deploy-contract" tool
server.tool(
  "deploy-contract",
  "Compile and deploy a Solidity smart contract to Monad testnet",
  {
    sourceCode: z.string().describe("Solidity source code of the contract"),
    privateKey: z.string().optional().describe("Private key for deployment (without 0x prefix). If not provided, will use PRIVATE_KEY from environment."),
    constructorArgs: z.array(z.any()).optional().describe("Constructor arguments (if any)"),
    contractName: z.string().optional().describe("Contract name (will be auto-detected if not provided)"),
    solcVersion: z.string().optional().describe("Solidity compiler version (default: 0.8.19)"),
  },
  async ({ sourceCode, privateKey, constructorArgs, contractName, solcVersion }) => {
    try {
      // Use provided private key or fall back to environment variable
      const deploymentKey = privateKey || process.env.PRIVATE_KEY;
      
      if (!deploymentKey) {
        throw new Error("No private key provided. Either pass 'privateKey' parameter or set PRIVATE_KEY environment variable in your .env file.");
      }
      
      // Validate private key format
      const normalizedKey = deploymentKey.replace(/^0x/, '');
      if (!/^[0-9a-fA-F]{64}$/.test(normalizedKey)) {
        throw new Error("Invalid private key format. The private key must be a 64-character hex string.");
      }
      
      // Compile and deploy the contract
      const result = await compileAndDeploy(
        sourceCode,
        deploymentKey,
        constructorArgs || [],
        {
          contractName,
          solcVersion,
          saveArtifacts: true
        }
      );

      return {
        content: [
          {
            type: "text",
            text: `✅ Contract ${result.contractName} deployed successfully!\n\n` +
                 `📝 Contract Address: ${result.address}\n` +
                 `🔗 Transaction Hash: ${result.transactionHash}\n` +
                 `💾 Contract artifacts saved to: ${result.artifactPath}`
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Contract deployment failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
        isError: true,
      };
    }
  }
);

// 🧠 Start the MCP server (stdio transport)
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Monad testnet MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
