/**
 * Contract deployment utility using getPrivateKey
 * This script can be used by AI assistants (like Claude) to deploy contracts
 * by simply pointing it to a Solidity file path.
 */

const fs = require('fs');
const path = require('path');
const solc = require('solc');
const viem = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { monadTestnet } = require('viem/chains');
const { PRIVATE_KEY, getPrivateKey } = require('./getPrivateKey');

/**
 * Compiles a Solidity contract
 * @param {string} contractPath - Path to the Solidity file
 * @returns {Object} The compiled contract with ABI and bytecode
 */
function compileContract(contractPath) {
  console.log(`Compiling contract at ${contractPath}...`);
  
  // Read the contract source
  const contractSource = fs.readFileSync(contractPath, 'utf8');
  
  // Extract contract name from file name
  const contractName = path.basename(contractPath, '.sol');
  
  // Prepare compiler input
  const input = {
    language: 'Solidity',
    sources: {
      [contractName]: {
        content: contractSource
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
        runs: 200
      }
    }
  };

  // Compile the contract
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  
  // Check for compilation errors
  if (output.errors) {
    const errors = output.errors.filter(error => error.severity === 'error');
    if (errors.length > 0) {
      console.error('❌ Compilation errors:');
      errors.forEach(error => console.error(error.formattedMessage));
      throw new Error('Contract compilation failed');
    }
  }
  
  // Get the compiled contract data
  const contractOutput = output.contracts[contractName][contractName];
  if (!contractOutput) {
    throw new Error(`Contract ${contractName} not found in compiled output`);
  }
  
  return {
    name: contractName,
    abi: contractOutput.abi,
    bytecode: `0x${contractOutput.evm.bytecode.object}`
  };
}

/**
 * Deploys a contract to the Monad testnet
 * @param {string} contractPath - Path to the Solidity file
 * @param {Array} constructorArgs - Constructor arguments for the contract
 * @returns {Object} Deployment result with contract address and transaction hash
 */
async function deployContract(contractPath, constructorArgs = []) {
  try {
    // Get the private key
    const privateKey = getPrivateKey();
    
    // Compile the contract
    const { name, abi, bytecode } = compileContract(contractPath);
    
    console.log(`Deploying ${name} to Monad testnet...`);
    
    // Normalize private key and create account
    const normalizedKey = privateKey.replace(/^0x/, '');
    const account = privateKeyToAccount(`0x${normalizedKey}`);
    
    console.log(`Deploying from address: ${account.address}`);
    
    // Create clients
    const publicClient = viem.createPublicClient({
      chain: monadTestnet,
      transport: viem.http(process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz'),
    });
    
    const walletClient = viem.createWalletClient({
      account,
      chain: monadTestnet,
      transport: viem.http(process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz'),
    });
    
    // Deploy the contract
    const hash = await walletClient.deployContract({
      abi,
      bytecode,
      args: constructorArgs,
    });
    
    console.log(`Transaction hash: ${hash}`);
    
    // Wait for transaction receipt
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    
    if (!receipt.contractAddress) {
      throw new Error('Contract deployment failed - no contract address in receipt');
    }
    
    console.log('✅ Contract deployed successfully!');
    console.log(`📝 Contract Address: ${receipt.contractAddress}`);
    console.log(`🔗 Transaction Hash: ${hash}`);
    
    // Save the contract artifacts
    const artifactsDir = path.join(__dirname, 'artifacts');
    
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }
    
    const artifactPath = path.join(artifactsDir, `${name}.json`);
    fs.writeFileSync(
      artifactPath,
      JSON.stringify({
        contractName: name,
        abi,
        address: receipt.contractAddress,
        deployedAt: new Date().toISOString(),
      }, null, 2)
    );
    
    console.log(`💾 Contract artifacts saved to: ${artifactPath}`);
    
    return {
      name,
      address: receipt.contractAddress,
      transactionHash: hash,
      artifactPath
    };
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    if (error.cause) {
      console.error('Cause:', error.cause);
    }
    throw error;
  }
}

// Direct execution support
if (require.main === module) {
  // Get arguments
  const [,, contractPath, ...args] = process.argv;
  
  if (!contractPath) {
    console.error('❌ Error: No contract path provided');
    console.error('Usage: node deploy-contract.js <path-to-contract.sol> [constructorArg1 constructorArg2 ...]');
    process.exit(1);
  }
  
  // Run deployment
  deployContract(contractPath, args).catch(err => {
    console.error('Deployment failed:', err);
    process.exit(1);
  });
} else {
  // Export for use as a module
  module.exports = {
    deployContract,
    compileContract
  };
} 