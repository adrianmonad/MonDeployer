#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

// Schema for deploy-contract tool
const DeployContractArgsSchema = z.object({
    sourceCode: z.string().describe("The Solidity source code to compile and deploy"),
    constructorArgs: z.array(z.any()).optional().describe("Arguments for the contract constructor"),
    contractName: z.string().optional().describe("Name of the contract (if not provided, will be extracted from the source)"),
    saveArtifacts: z.boolean().optional().default(true).describe("Whether to save contract artifacts for later use"),
});

// Directory operations
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

// Helper function to write a file to a temporary directory
async function writeSourceToTempFile(sourceCode: string, fileName: string): Promise<string> {
    const tempDir = path.join(os.tmpdir(), 'monad-deploy');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const filePath = path.join(tempDir, fileName);
    fs.writeFileSync(filePath, sourceCode);
    return filePath;
}

// Define interface for deployment result
interface DeploymentResult {
    success: boolean;
    address?: string;
    transactionHash?: string;
    contractName?: string;
    artifactPath?: string;
    explorerUrl?: string;
    error?: string;
}

// Main contract deployment function
async function deployContract(args: {
    sourceCode: string,
    constructorArgs?: any[],
    contractName?: string,
    saveArtifacts?: boolean
}): Promise<DeploymentResult> {
    try {
        // Extract the contract name if not provided
        let contractName = args.contractName;
        if (!contractName) {
            const match = args.sourceCode.match(/contract\s+([a-zA-Z0-9_]+)/);
            if (!match || !match[1]) {
                return {
                    success: false,
                    error: "Could not extract contract name from source code"
                };
            }
            contractName = match[1];
        }
        
        // Create a temporary deployment script in the main project directory
        // This ensures it has access to all dependencies
        const deployScriptPath = path.join(ROOT_DIR, 'temp-deploy-script.js');
        
        // Escape backticks in source code for template literal
        const escapedSource = args.sourceCode.replace(/`/g, '\\`');
        
        // Build deployment script as a string
        const deployScript = `
// Temporary deployment script - will be deleted after use
const fs = require('fs');
const path = require('path');
const solc = require('solc');
const { createPublicClient, createWalletClient, http } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const os = require('os');

// Get private key from env.js - absolute path to ensure it works regardless of working directory
const envJsPath = path.resolve('${ROOT_DIR}', 'env.js');
console.log('Looking for env.js at:', envJsPath);

// Load the PRIVATE_KEY from env.js
const { PRIVATE_KEY } = require(envJsPath);

// Contract details
const CONTRACT_SOURCE = \`${escapedSource}\`;
const CONTRACT_NAME = '${contractName}';
const CONSTRUCTOR_ARGS = ${JSON.stringify(args.constructorArgs || [])};
const SAVE_ARTIFACTS = ${args.saveArtifacts !== false};

// Monad testnet configuration
const MONAD_RPC_URL = 'https://testnet-rpc.monad.xyz';
const MONAD_CHAIN_ID = 10143;

async function compileSolidity(source, contractName) {
    console.log('Compiling contract...');
    
    // Use Solidity compiler version 0.8.28 as specified
    const solidityVersion = '0.8.28';
    
    // Create compiler input
    const input = {
        language: 'Solidity',
        sources: {
            [\`\${contractName}.sol\`]: { content: source }
        },
        settings: {
            outputSelection: {
                '*': { '*': ['abi', 'evm.bytecode.object'] }
            },
            optimizer: { enabled: true, runs: 200 }
        }
    };

    try {
        // Use a specific compiler version as requested
        return new Promise((resolve, reject) => {
            solc.loadRemoteVersion('v' + solidityVersion, (err, solcSnapshot) => {
                if (err) {
                    return reject({
                        success: false,
                        error: \`Failed to load Solidity compiler v\${solidityVersion}: \${err.message}\`
                    });
                }
                
                try {
                    // Compile the source code
                    const output = JSON.parse(solcSnapshot.compile(JSON.stringify(input)));
                    
                    // Check for errors
                    if (output.errors) {
                        const errors = output.errors.filter(error => error.severity === 'error');
                        if (errors.length > 0) {
                            const errorMessage = errors.map(e => e.formattedMessage).join('\\n');
                            return reject({
                                success: false,
                                error: \`Compilation errors:\\n\${errorMessage}\`
                            });
                        }
                    }
                    
                    // Get the compiled contract
                    const compiledContract = output.contracts[\`\${contractName}.sol\`][contractName];
                    if (!compiledContract) {
                        return reject({
                            success: false,
                            error: \`Contract \${contractName} not found in compiled output\`
                        });
                    }
                    
                    resolve({
                        success: true,
                        abi: compiledContract.abi,
                        bytecode: \`0x\${compiledContract.evm.bytecode.object}\`
                    });
                } catch (compileError) {
                    reject({
                        success: false,
                        error: \`Compilation error: \${compileError.message}\`
                    });
                }
            });
        });
    } catch (compileError) {
        return {
            success: false,
            error: \`Compilation error: \${compileError.message}\`
        };
    }
}

async function deployContract() {
    try {
        // Validate private key
        if (!PRIVATE_KEY) {
            console.error('PRIVATE_KEY not found in env.js');
            return console.log(JSON.stringify({
                success: false,
                error: 'PRIVATE_KEY not found in env.js'
            }));
        }
        
        console.log(\`Deploying \${CONTRACT_NAME} to Monad testnet...\`);
        
        // First compile the contract
        let compileResult;
        try {
            compileResult = await compileSolidity(CONTRACT_SOURCE, CONTRACT_NAME);
            if (!compileResult.success) {
                return console.log(JSON.stringify(compileResult));
            }
        } catch (error) {
            if (typeof error === 'object' && error !== null && 'success' in error) {
                return console.log(JSON.stringify(error));
            }
            return console.log(JSON.stringify({
                success: false,
                error: \`Compilation failed: \${error.message || String(error)}\`
            }));
        }
        
        const { abi, bytecode } = compileResult;
        
        // Create an account from the private key
        const privateKey = PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : \`0x\${PRIVATE_KEY}\`;
        const account = privateKeyToAccount(privateKey);
        
        console.log(\`Deploying from address: \${account.address}\`);
        
        // Define the Monad testnet chain
        const monadTestnet = {
            id: MONAD_CHAIN_ID,
            name: 'Monad Testnet',
            network: 'monad-testnet',
            nativeCurrency: {
                name: 'MON',
                symbol: 'MON',
                decimals: 18
            },
            rpcUrls: {
                default: {
                    http: [MONAD_RPC_URL],
                },
                public: {
                    http: [MONAD_RPC_URL],
                }
            }
        };
        
        // Create clients
        const publicClient = createPublicClient({
            chain: monadTestnet,
            transport: http(MONAD_RPC_URL)
        });
        
        const walletClient = createWalletClient({
            account,
            chain: monadTestnet,
            transport: http(MONAD_RPC_URL)
        });
        
        // Deploy the contract
        console.log('Sending transaction...');
        let hash;
        try {
            hash = await walletClient.deployContract({
                abi,
                bytecode,
                args: CONSTRUCTOR_ARGS,
            });
        } catch (error) {
            return console.log(JSON.stringify({
                success: false,
                error: \`Transaction failed: \${error.message || String(error)}\`
            }));
        }
        
        console.log(\`Transaction hash: \${hash}\`);
        
        // Wait for transaction receipt
        console.log('Waiting for transaction confirmation...');
        let receipt;
        try {
            receipt = await publicClient.waitForTransactionReceipt({ hash });
        } catch (error) {
            return console.log(JSON.stringify({
                success: false,
                error: \`Failed to get transaction receipt: \${error.message || String(error)}\`,
                transactionHash: hash
            }));
        }
        
        if (!receipt.contractAddress) {
            return console.log(JSON.stringify({
                success: false,
                error: 'Contract deployment failed - no contract address in receipt',
                transactionHash: hash
            }));
        }
        
        console.log('✅ Contract deployed successfully!');
        console.log(\`📝 Contract Address: \${receipt.contractAddress}\`);
        console.log(\`🔗 Transaction Hash: \${hash}\`);
        console.log(\`🌐 Explorer URL: https://explorer.testnet.monad.xyz/tx/\${hash}\`);
        
        // Save artifacts if requested
        let artifactPath;
        if (SAVE_ARTIFACTS) {
            const tempDir = os.tmpdir();
            const artifactsDir = path.join(tempDir, 'monad-deployments');
            
            if (!fs.existsSync(artifactsDir)) {
                fs.mkdirSync(artifactsDir, { recursive: true });
            }
            
            artifactPath = path.join(artifactsDir, \`\${CONTRACT_NAME}.json\`);
            
            // Save ABI and address to file
            fs.writeFileSync(artifactPath, JSON.stringify({
                contractName: CONTRACT_NAME,
                address: receipt.contractAddress,
                abi,
                transactionHash: hash,
                network: 'monad-testnet',
                chainId: MONAD_CHAIN_ID,
                explorerUrl: \`https://explorer.testnet.monad.xyz/tx/\${hash}\`
            }, null, 2));
            
            console.log(\`💾 Contract artifacts saved to: \${artifactPath}\`);
        }
        
        // Return deployment information
        const result = {
            success: true,
            address: receipt.contractAddress,
            transactionHash: hash,
            chainId: MONAD_CHAIN_ID,
            contractName: CONTRACT_NAME,
            explorerUrl: \`https://explorer.testnet.monad.xyz/tx/\${hash}\`
        };
        
        if (SAVE_ARTIFACTS) {
            result.artifactPath = artifactPath;
        }
        
        // Only output valid JSON for the parent process to parse
        console.log(JSON.stringify(result));
        
        // Clean up after ourselves
        setTimeout(() => {
            try {
                fs.unlinkSync(__filename);
                console.log('Cleaned up temporary deployment script');
            } catch (err) {
                // Ignore errors in cleanup
            }
        }, 1000);
    } catch (error) {
        console.error('Deployment failed:', error.message);
        console.log(JSON.stringify({ 
            success: false,
            error: error instanceof Error ? error.message : String(error)
        }));
    }
}

// Create MCP server
const server = new McpServer({
    name: "monad-mcp",
    version: "1.0.0",
});

// Register the deploy-contract tool
server.tool(
    "deploy-contract",
    "Compile and deploy a Solidity contract to the Monad testnet using the project's private key",
    {
        sourceCode: z.string().describe("The Solidity source code to compile and deploy"),
        constructorArgs: z.array(z.any()).optional().describe("Arguments for the contract constructor"),
        contractName: z.string().optional().describe("Name of the contract (if not provided, will be extracted from the source)"),
        saveArtifacts: z.boolean().optional().default(true).describe("Whether to save contract artifacts for later use"),
    },
    async (input) => {
        try {
            // Log progress messages to stderr instead of stdout to avoid interfering with JSON
            console.error("Starting contract deployment process...");
            
            // Validate input first to handle malformed payloads gracefully
            if (!input || typeof input !== 'object' || !input.sourceCode) {
                console.error("Invalid input received:", input);
                
                // Return a properly formatted JSON response for invalid input
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
            
            console.error("Compiling and deploying contract...");
            const result = await deployContract(input) as DeploymentResult;
            console.error("Deployment completed, returning result");
            
            // Ensure we return proper JSON format
            if (result.success) {
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify({
                            success: true,
                            address: result.address,
                            transactionHash: result.transactionHash,
                            explorerUrl: result.explorerUrl
                        })
                    }]
                };
            } else {
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify({
                            success: false,
                            error: result.error || "Unknown error occurred"
                        })
                    }]
                };
            }
        } catch (error) {
            console.error("Tool execution error:", error);
            
            // Return a properly formatted JSON error response
            return {
                content: [{ 
                    type: "text", 
                    text: JSON.stringify({
                        success: false,
                        error: error instanceof Error ? error.message : String(error)
                    })
                }]
            };
        }
    }
);

// Export the tools for direct access by Claude
export const tools = {
    'deploy-contract': async function(params: {
        sourceCode: string,
        constructorArgs?: any[],
        contractName?: string,
        saveArtifacts?: boolean
    }): Promise<DeploymentResult> {
        try {
            console.log("Direct tool call received:", params);
            
            // Validate input
            if (!params || typeof params !== 'object' || !params.sourceCode) {
                console.error("Invalid direct tool call params:", params);
                return {
                    success: false,
                    error: "Invalid input: source code is required"
                };
            }
            
            const result = await deployContract(params) as DeploymentResult;
            
            // Always return a structured JSON object
            return result.success === false 
                ? { success: false, error: result.error }
                : {
                    success: true,
                    address: result.address,
                    transactionHash: result.transactionHash,
                    contractName: result.contractName,
                    explorerUrl: result.explorerUrl,
                    ...(result.artifactPath ? { artifactPath: result.artifactPath } : {})
                };
        } catch (error) {
            console.error("Direct tool call error:", error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
};

// Start server async function
async function runServer() {
    try {
        const transport = new StdioServerTransport();
        
        // Listen for uncaught errors to prevent plain text from being sent
        process.on('uncaughtException', (error) => {
            console.error('Uncaught exception:', error);
            // Always return JSON for any errors
            console.log(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            }));
        });
        
        // Redirect console output to stderr so it doesn't interfere with MCP communication
        const originalConsoleLog = console.log;
        console.log = (...args) => {
            // Only use stderr for debugging messages, not for actual JSON responses
            if (typeof args[0] === 'string' && 
                !args[0].startsWith('{') && 
                !args[0].startsWith('[')) {
                console.error(...args);
            } else {
                originalConsoleLog(...args);
            }
        };
        
        await server.connect(transport);
        
        // Log startup message to stderr instead of stdout
        console.error("Monad MCP server running...");
    } catch (error) {
        console.error("Error starting MCP server:", error);
        process.exit(1);
    }
}

// Run the server
runServer().catch((error) => {
    console.error("Fatal error running server:", error);
    process.exit(1);
}); 