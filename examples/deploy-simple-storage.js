/**
 * Script to deploy SimpleStorage contract
 * USING THE CORRECT SOLIDITY VERSION
 */
const fs = require('fs');
const path = require('path');
const { createPublicClient, createWalletClient, http } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const os = require('os');
const solc = require('solc');

// Load private key from env.js
const { PRIVATE_KEY } = require('../env.js');

// Validate private key
if (!PRIVATE_KEY) {
  console.error('\x1b[31mError: PRIVATE_KEY not found in env.js\x1b[0m');
  console.error('Please create an env.js file with:');
  console.error('exports.PRIVATE_KEY = "your_private_key_here";');
  process.exit(1);
}

// Load the contract source
const contractPath = path.join(__dirname, 'SimpleStorage.sol');
const contractSource = fs.readFileSync(contractPath, 'utf8');
const contractName = 'SimpleStorage';

// Strictly validate the Solidity version
if (!contractSource.includes('pragma solidity 0.8.28')) {
  console.error('\x1b[31mError: Contract must use Solidity version 0.8.28 exactly\x1b[0m');
  console.error('Current version in contract:', contractSource.match(/pragma solidity [^;]+/)[0]);
  console.error('Change to: pragma solidity 0.8.28;');
  process.exit(1);
}

// Constants for Monad testnet
const MONAD_RPC_URL = 'https://testnet-rpc.monad.xyz';
const MONAD_CHAIN_ID = 10143;

/**
 * Compile the Solidity contract
 */
async function compileContract() {
  console.log('Compiling contract using Solidity 0.8.28...');
  
  const input = {
    language: 'Solidity',
    sources: {
      'SimpleStorage.sol': { content: contractSource }
    },
    settings: {
      outputSelection: {
        '*': { '*': ['abi', 'evm.bytecode.object'] }
      },
      optimizer: { enabled: true, runs: 200 }
    }
  };
  
  return new Promise((resolve, reject) => {
    // IMPORTANT: Use the exact compiler version 0.8.28
    solc.loadRemoteVersion('v0.8.28', (err, solcSnapshot) => {
      if (err) {
        return reject(new Error(`Failed to load Solidity compiler: ${err.message}`));
      }
      
      try {
        const output = JSON.parse(solcSnapshot.compile(JSON.stringify(input)));
        
        if (output.errors) {
          const errors = output.errors.filter(error => error.severity === 'error');
          if (errors.length > 0) {
            const errorMessage = errors.map(e => e.formattedMessage).join('\n');
            return reject(new Error(`Compilation errors:\n${errorMessage}`));
          }
        }
        
        const compiledContract = output.contracts['SimpleStorage.sol'][contractName];
        if (!compiledContract) {
          return reject(new Error(`Contract ${contractName} not found in compiled output`));
        }
        
        resolve({
          abi: compiledContract.abi,
          bytecode: `0x${compiledContract.evm.bytecode.object}`
        });
      } catch (error) {
        reject(new Error(`Compilation failed: ${error.message}`));
      }
    });
  });
}

/**
 * Deploy the compiled contract
 */
async function deployContract() {
  try {
    console.log('Starting deployment process...');
    
    // 1. Compile the contract
    const { abi, bytecode } = await compileContract();
    console.log('✅ Contract compiled successfully');
    
    // 2. Prepare Monad testnet configuration
    const account = privateKeyToAccount(`0x${PRIVATE_KEY.replace(/^0x/, '')}`);
    console.log(`Deploying from address: ${account.address}`);
    
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
        default: { http: [MONAD_RPC_URL] },
        public: { http: [MONAD_RPC_URL] }
      }
    };
    
    // 3. Create clients
    const publicClient = createPublicClient({
      chain: monadTestnet,
      transport: http(MONAD_RPC_URL)
    });
    
    const walletClient = createWalletClient({
      account,
      chain: monadTestnet,
      transport: http(MONAD_RPC_URL)
    });
    
    // 4. Deploy contract
    console.log('Sending transaction...');
    const hash = await walletClient.deployContract({
      abi,
      bytecode,
      args: []  // No constructor arguments
    });
    
    console.log(`Transaction hash: ${hash}`);
    
    // 5. Wait for confirmation
    console.log('Waiting for transaction confirmation...');
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    
    if (!receipt.contractAddress) {
      throw new Error('Deployment failed - no contract address in receipt');
    }
    
    // 6. Save artifacts
    const tempDir = os.tmpdir();
    const artifactsDir = path.join(tempDir, 'monad-deployments');
    
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }
    
    const artifactPath = path.join(artifactsDir, `${contractName}.json`);
    fs.writeFileSync(artifactPath, JSON.stringify({
      contractName,
      address: receipt.contractAddress,
      abi,
      transactionHash: hash,
      network: 'monad-testnet',
      chainId: MONAD_CHAIN_ID,
      explorerUrl: `https://explorer.testnet.monad.xyz/tx/${hash}`
    }, null, 2));
    
    // 7. Display results
    console.log('\n====== DEPLOYMENT SUCCESSFUL ======');
    console.log(`Contract: ${contractName}`);
    console.log(`Address: ${receipt.contractAddress}`);
    console.log(`Transaction: ${hash}`);
    console.log(`Explorer: https://explorer.testnet.monad.xyz/tx/${hash}`);
    console.log(`Artifacts saved to: ${artifactPath}`);
    console.log('==================================\n');
    
    return {
      success: true,
      contractName,
      address: receipt.contractAddress,
      transactionHash: hash,
      explorerUrl: `https://explorer.testnet.monad.xyz/tx/${hash}`,
      artifactPath
    };
  } catch (error) {
    console.error('\x1b[31mDeployment failed:\x1b[0m', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the deployment if script is executed directly
if (require.main === module) {
  deployContract()
    .then(result => {
      if (!result.success) {
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = { deployContract, compileContract }; 