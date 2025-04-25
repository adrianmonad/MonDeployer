/**
 * Clean contract deployment script for Monad with improved JSON handling
 * 
 * IMPORTANT: All contracts MUST use Solidity version 0.8.28 exactly
 */
const fs = require('fs');
const path = require('path');
const solc = require('solc');
const { createPublicClient, createWalletClient, http } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const os = require('os');

// Import private key from env.js
const { PRIVATE_KEY } = require('../env.js');

// Validate private key - use error object formatting that works with JSON
if (!PRIVATE_KEY) {
  const errorObj = { 
    success: false, 
    error: 'PRIVATE_KEY not found in env.js' 
  };
  console.log(JSON.stringify(errorObj));
  process.exit(1);
}

// Helper function to safely log JSON messages
function logJson(obj) {
  try {
    console.log(JSON.stringify(obj));
  } catch (e) {
    console.log(JSON.stringify({ 
      success: false, 
      error: 'Failed to stringify JSON object' 
    }));
  }
}

// Helper function to safely log progress messages to stderr
function logProgress(message) {
  console.error(message);
}

// -----------------------------------------------------
// EDIT THESE VALUES FOR YOUR CONTRACT
// -----------------------------------------------------

// Path to your contract file - uncomment and modify as needed
// const CONTRACT_PATH = path.join(__dirname, 'SimpleToken.sol');

// Contract source code (can be provided directly or loaded from file)
const CONTRACT_SOURCE = fs.readFileSync(path.join(__dirname, 'SimpleToken.sol'), 'utf8');

// Contract name (if null, will be extracted from source)
const CONTRACT_NAME = 'SimpleToken';

// Contract constructor arguments
const CONSTRUCTOR_ARGS = [
  "My Token", // name
  "MTK",      // symbol
  18,         // decimals
  1000000     // initialSupply
];

// -----------------------------------------------------
// SOLIDITY COMPILATION FUNCTIONS
// -----------------------------------------------------

/**
 * Compile a Solidity contract
 */
async function compileSolidity(source, contractName) {
  // Use Solidity compiler version 0.8.28 as specified
  const solidityVersion = '0.8.28';
  
  // Enforce correct Solidity version
  if (!source.includes('pragma solidity 0.8.28')) {
    return {
      success: false,
      error: 'Contract must use Solidity version 0.8.28 exactly'
    };
  }
  
  // Create compiler input
  const input = {
    language: 'Solidity',
    sources: {
      [`${contractName}.sol`]: { content: source }
    },
    settings: {
      outputSelection: {
        '*': { '*': ['abi', 'evm.bytecode.object'] }
      },
      optimizer: { enabled: true, runs: 200 }
    }
  };

  try {
    // Use a specific compiler version
    return new Promise((resolve, reject) => {
      solc.loadRemoteVersion('v' + solidityVersion, (err, solcSnapshot) => {
        if (err) {
          return resolve({
            success: false,
            error: `Failed to load Solidity compiler v${solidityVersion}: ${err.message}`
          });
        }
        
        try {
          // Compile the source code
          const output = JSON.parse(solcSnapshot.compile(JSON.stringify(input)));
          
          // Check for errors
          if (output.errors) {
            const errors = output.errors.filter(error => error.severity === 'error');
            if (errors.length > 0) {
              const errorMessage = errors.map(e => e.formattedMessage).join('\n');
              return resolve({
                success: false,
                error: `Compilation errors:\n${errorMessage}`
              });
            }
          }
          
          // Get the compiled contract
          const compiledContract = output.contracts[`${contractName}.sol`][contractName];
          if (!compiledContract) {
            return resolve({
              success: false,
              error: `Contract ${contractName} not found in compiled output`
            });
          }
          
          resolve({
            success: true,
            abi: compiledContract.abi,
            bytecode: `0x${compiledContract.evm.bytecode.object}`
          });
        } catch (compileError) {
          resolve({
            success: false,
            error: `Compilation error: ${compileError.message}`
          });
        }
      });
    });
  } catch (error) {
    return {
      success: false,
      error: `Compilation error: ${error.message}`
    };
  }
}

// -----------------------------------------------------
// DEPLOYMENT FUNCTIONS
// -----------------------------------------------------

/**
 * Extract contract name from Solidity source code
 */
function extractContractName(source) {
  const match = source.match(/contract\s+([a-zA-Z0-9_]+)/);
  if (!match || !match[1]) {
    return null;
  }
  return match[1];
}

/**
 * Deploy the contract to Monad testnet
 */
async function deployContract() {
  try {
    // Extract the contract name if not provided
    const contractName = CONTRACT_NAME || extractContractName(CONTRACT_SOURCE);
    if (!contractName) {
      return logJson({
        success: false,
        error: "Could not extract contract name from source code"
      });
    }
    
    // Log compilation start
    logProgress(`Compiling ${contractName}...`);
    
    // Compile the contract
    const compileResult = await compileSolidity(CONTRACT_SOURCE, contractName);
    if (!compileResult.success) {
      return logJson(compileResult);
    }
    
    const { abi, bytecode } = compileResult;
    
    // Create an account from the private key
    const privateKey = PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`;
    const account = privateKeyToAccount(privateKey);
    
    logProgress(`Deploying from address: ${account.address}`);
    
    // Define the Monad testnet chain
    const monadTestnet = {
      id: 10143,
      name: 'Monad Testnet',
      network: 'monad-testnet',
      nativeCurrency: {
        name: 'MON',
        symbol: 'MON',
        decimals: 18
      },
      rpcUrls: {
        default: {
          http: ['https://testnet-rpc.monad.xyz'],
        },
        public: {
          http: ['https://testnet-rpc.monad.xyz'],
        }
      }
    };
    
    // Create clients
    const publicClient = createPublicClient({
      chain: monadTestnet,
      transport: http('https://testnet-rpc.monad.xyz')
    });
    
    const walletClient = createWalletClient({
      account,
      chain: monadTestnet,
      transport: http('https://testnet-rpc.monad.xyz')
    });
    
    // Deploy the contract
    logProgress('Sending transaction...');
    let hash;
    try {
      hash = await walletClient.deployContract({
        abi,
        bytecode,
        args: CONSTRUCTOR_ARGS,
      });
    } catch (error) {
      return logJson({
        success: false,
        error: `Transaction failed: ${error.message || String(error)}`
      });
    }
    
    logProgress(`Transaction hash: ${hash}`);
    
    // Wait for transaction receipt
    logProgress('Waiting for transaction confirmation...');
    let receipt;
    try {
      receipt = await publicClient.waitForTransactionReceipt({ hash });
    } catch (error) {
      return logJson({
        success: false,
        error: `Failed to get transaction receipt: ${error.message || String(error)}`,
        transactionHash: hash
      });
    }
    
    if (!receipt.contractAddress) {
      return logJson({
        success: false,
        error: 'Contract deployment failed - no contract address in receipt',
        transactionHash: hash
      });
    }
    
    // Save artifacts
    let artifactPath;
    const tempDir = os.tmpdir();
    const artifactsDir = path.join(tempDir, 'monad-deployments');
    
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }
    
    artifactPath = path.join(artifactsDir, `${contractName}.json`);
    
    // Save ABI and address to file
    fs.writeFileSync(artifactPath, JSON.stringify({
      contractName,
      address: receipt.contractAddress,
      abi,
      transactionHash: hash,
      network: 'monad-testnet',
      chainId: 10143,
      explorerUrl: `https://explorer.testnet.monad.xyz/tx/${hash}`
    }, null, 2));
    
    logProgress(`Contract artifacts saved to: ${artifactPath}`);
    
    // Return deployment information
    return logJson({
      success: true,
      address: receipt.contractAddress,
      transactionHash: hash,
      contractName,
      explorerUrl: `https://explorer.testnet.monad.xyz/tx/${hash}`,
      artifactPath
    });
  } catch (error) {
    logProgress(`Deployment failed: ${error.message}`);
    return logJson({ 
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

// Execute deployment if run directly
if (require.main === module) {
  deployContract();
}

module.exports = { deployContract }; 