import * as solc from 'solc';
// Add declaration for solc module
declare module 'solc' {
  function loadRemoteVersion(version: string, callback: (err: Error | null, solcSnapshot: any) => void): void;
}

import { createWalletClient, http, createPublicClient, parseEther, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from 'viem/chains';
import fs from 'fs';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration
const COMPILER_VERSION = process.env.SOLIDITY_VERSION || '0.8.19';
const DEFAULT_OPTIMIZATION_RUNS = parseInt(process.env.OPTIMIZATION_RUNS || '200', 10);

/**
 * Fetches the Solidity compiler version
 * @param version Solidity compiler version
 */
async function getSolcVersion(version: string): Promise<any> {
  return new Promise((resolve, reject) => {
    solc.loadRemoteVersion(`v${version}`, (err: Error | null, solcSnapshot: any) => {
      if (err) {
        reject(new Error(`Failed to load Solidity compiler v${version}: ${err.message}`));
      } else {
        resolve(solcSnapshot);
      }
    });
  });
}

/**
 * Compiles Solidity source code
 * @param source The Solidity source code
 * @param contractName The name of the contract to compile
 * @param version Solidity compiler version
 * @param optimizationRuns Number of optimization runs
 */
async function compileSolidity(
  source: string,
  contractName: string,
  version: string = COMPILER_VERSION,
  optimizationRuns: number = DEFAULT_OPTIMIZATION_RUNS
): Promise<{ abi: any, bytecode: string }> {
  const solcSnapshot = await getSolcVersion(version);

  // Prepare the input for the compiler
  const input = {
    language: 'Solidity',
    sources: {
      [`${contractName}.sol`]: {
        content: source
      }
    },
    settings: {
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object']
        }
      },
      optimizer: {
        enabled: true,
        runs: optimizationRuns
      }
    }
  };

  // Compile the source code
  const output = JSON.parse(solcSnapshot.compile(JSON.stringify(input)));

  // Check for errors
  if (output.errors) {
    const errors = output.errors.filter((error: any) => error.severity === 'error');
    if (errors.length > 0) {
      const errorMessage = errors.map((e: any) => e.formattedMessage).join('\n');
      throw new Error(`Compilation errors:\n${errorMessage}`);
    }
  }

  // Get the compiled contract
  const compiledContract = output.contracts[`${contractName}.sol`][contractName];
  
  if (!compiledContract) {
    throw new Error(`Contract ${contractName} not found in the compiled output`);
  }

  return {
    abi: compiledContract.abi,
    bytecode: `0x${compiledContract.evm.bytecode.object}`
  };
}

/**
 * Deploys a contract to the Monad testnet
 * @param abi The contract ABI
 * @param bytecode The contract bytecode
 * @param privateKey The private key for deployment
 * @param constructorArgs Arguments for the contract constructor
 */
async function deployContract(
  abi: any,
  bytecode: string,
  privateKey: string,
  constructorArgs: any[] = []
): Promise<{ address: string, transactionHash: string }> {
  // Validate the private key
  if (!privateKey) {
    throw new Error('Private key is required for deployment. Please check your .env file or pass a private key parameter.');
  }

  // Normalize the private key (remove 0x prefix if present)
  const normalizedKey = privateKey.replace(/^0x/, '');
  
  // Additional validation for private key format
  if (!/^[0-9a-fA-F]{64}$/.test(normalizedKey)) {
    throw new Error('Invalid private key format. The private key must be a 64-character hex string.');
  }

  // Create an account from the private key
  const account = privateKeyToAccount(`0x${normalizedKey}`);

  // Create wallet and public clients
  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http('https://rpc.monad.xyz/testnet'),
  });

  const walletClient = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http('https://rpc.monad.xyz/testnet'),
  });

  try {
    // Prepare the transaction
    const deploymentData = bytecode +
      (constructorArgs.length > 0 
        ? encodeFunctionData({
            abi: abi.filter((item: any) => item.type === 'constructor'),
            args: constructorArgs
          }).slice(2) 
        : '');

    // Estimate gas
    const gasEstimate = await publicClient.estimateGas({
      account: account.address,
      data: deploymentData as `0x${string}`,
    });

    // Send transaction
    const hash = await walletClient.deployContract({
      abi,
      bytecode: bytecode as `0x${string}`,
      args: constructorArgs,
      gas: BigInt(Math.floor(Number(gasEstimate) * 1.1)), // Add 10% buffer
    });

    // Wait for receipt
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (!receipt.contractAddress) {
      throw new Error('Contract deployment failed - no contract address in receipt');
    }

    return {
      address: receipt.contractAddress,
      transactionHash: hash
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Deployment error: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Extract the contract name from Solidity source code
 * @param source The Solidity source code
 */
function extractContractName(source: string): string {
  const contractMatch = source.match(/contract\s+([a-zA-Z0-9_]+)/);
  
  if (!contractMatch || !contractMatch[1]) {
    throw new Error('Could not detect contract name from source code');
  }
  
  return contractMatch[1];
}

/**
 * Saves the contract compilation artifacts
 * @param contractName Name of the contract
 * @param abi The contract ABI
 * @param address The deployed contract address
 */
function saveContractArtifacts(contractName: string, abi: any, address: string): string {
  // Create a temporary directory for artifacts
  const artifactsDir = path.join(os.tmpdir(), 'monad-deployments');
  
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }
  
  const artifactPath = path.join(artifactsDir, `${contractName}.json`);
  
  // Save ABI and address to file
  fs.writeFileSync(
    artifactPath, 
    JSON.stringify({
      contractName,
      address,
      abi,
      network: 'monad-testnet'
    }, null, 2)
  );
  
  return artifactPath;
}

/**
 * Main function to compile and deploy a Solidity contract
 * @param sourceCode The Solidity source code
 * @param privateKey Private key for deployment (without 0x prefix)
 * @param constructorArgs Arguments for the contract constructor
 * @param options Additional options
 */
export async function compileAndDeploy(
  sourceCode: string,
  privateKey: string,
  constructorArgs: any[] = [],
  options: {
    contractName?: string,
    solcVersion?: string,
    optimizationRuns?: number,
    saveArtifacts?: boolean
  } = {}
): Promise<{
  address: string,
  transactionHash: string,
  abi: any,
  contractName: string,
  artifactPath?: string
}> {
  try {
    // Extract or use provided contract name
    const contractName = options.contractName || extractContractName(sourceCode);
    
    // Compile the contract
    const { abi, bytecode } = await compileSolidity(
      sourceCode,
      contractName,
      options.solcVersion || COMPILER_VERSION,
      options.optimizationRuns || DEFAULT_OPTIMIZATION_RUNS
    );
    
    // Deploy the contract
    const { address, transactionHash } = await deployContract(
      abi,
      bytecode,
      privateKey,
      constructorArgs
    );
    
    let artifactPath: string | undefined;
    
    // Save artifacts if requested
    if (options.saveArtifacts) {
      artifactPath = saveContractArtifacts(contractName, abi, address);
    }
    
    return {
      address,
      transactionHash,
      abi,
      contractName,
      artifactPath
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Contract compilation and deployment failed: ${error.message}`);
    }
    throw error;
  }
} 