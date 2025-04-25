/**
 * Contract interaction utility using getPrivateKey
 * This script can be used by AI assistants (like Claude) to interact with contracts
 * by specifying the contract address and function to call.
 */

const fs = require('fs');
const path = require('path');
const viem = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { monadTestnet } = require('viem/chains');
const { PRIVATE_KEY, getPrivateKey } = require('./getPrivateKey');

/**
 * Creates clients for interacting with Monad
 * @returns {Object} The publicClient and walletClient
 */
function createClients() {
  // Get the private key
  const privateKey = getPrivateKey();
  
  // Normalize private key and create account
  const normalizedKey = privateKey.replace(/^0x/, '');
  const account = privateKeyToAccount(`0x${normalizedKey}`);
  
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
  
  return { publicClient, walletClient, account };
}

/**
 * Loads contract ABI from artifacts directory
 * @param {string} contractName - The name of the contract
 * @returns {Array} The contract ABI
 */
function loadContractAbi(contractName) {
  // Check if artifacts directory exists
  const artifactsDir = path.join(__dirname, 'artifacts');
  const artifactPath = path.join(artifactsDir, `${contractName}.json`);
  
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Contract artifacts not found: ${artifactPath}`);
  }
  
  const artifacts = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  return artifacts.abi;
}

/**
 * Reads data from a contract
 * @param {string} contractAddress - The address of the deployed contract
 * @param {Array} abi - The contract ABI
 * @param {string} functionName - The function to call
 * @param {Array} args - Arguments for the function
 * @returns {any} The result of the call
 */
async function readContract(contractAddress, abi, functionName, args = []) {
  const { publicClient } = createClients();
  
  console.log(`📖 Reading from contract at ${contractAddress}`);
  console.log(`Function: ${functionName}(${args.join(', ')})`);
  
  try {
    const result = await publicClient.readContract({
      address: contractAddress,
      abi,
      functionName,
      args,
    });
    
    console.log(`Result: ${result}`);
    return result;
  } catch (error) {
    console.error(`❌ Error reading contract: ${error.message}`);
    throw error;
  }
}

/**
 * Writes data to a contract
 * @param {string} contractAddress - The address of the deployed contract
 * @param {Array} abi - The contract ABI
 * @param {string} functionName - The function to call
 * @param {Array} args - Arguments for the function
 * @returns {Object} The transaction receipt
 */
async function writeContract(contractAddress, abi, functionName, args = []) {
  const { publicClient, walletClient, account } = createClients();
  
  console.log(`✏️ Writing to contract at ${contractAddress}`);
  console.log(`Function: ${functionName}(${args.join(', ')})`);
  console.log(`From address: ${account.address}`);
  
  try {
    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi,
      functionName,
      args,
    });
    
    console.log(`Transaction hash: ${hash}`);
    
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log('✅ Transaction successful!');
    
    return receipt;
  } catch (error) {
    console.error(`❌ Error writing to contract: ${error.message}`);
    throw error;
  }
}

/**
 * Loads a contract and returns methods to interact with it
 * @param {string} contractNameOrAddress - The name or address of the contract
 * @returns {Object} Contract interaction methods
 */
function loadContract(contractNameOrAddress) {
  let address, abi;
  
  // Check if this is an address or contract name
  if (contractNameOrAddress.startsWith('0x')) {
    // It's an address, try to find matching artifact
    address = contractNameOrAddress;
    
    // Look through artifacts directory for matching address
    const artifactsDir = path.join(__dirname, 'artifacts');
    if (fs.existsSync(artifactsDir)) {
      const files = fs.readdirSync(artifactsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const artifact = JSON.parse(fs.readFileSync(path.join(artifactsDir, file), 'utf8'));
          if (artifact.address && artifact.address.toLowerCase() === address.toLowerCase()) {
            abi = artifact.abi;
            console.log(`Found ABI for contract at ${address} (${artifact.contractName})`);
            break;
          }
        }
      }
    }
    
    if (!abi) {
      throw new Error(`Could not find ABI for contract at ${address}`);
    }
  } else {
    // It's a contract name, load from artifacts
    const artifactsDir = path.join(__dirname, 'artifacts');
    const artifactPath = path.join(artifactsDir, `${contractNameOrAddress}.json`);
    
    if (!fs.existsSync(artifactPath)) {
      throw new Error(`Contract artifacts not found for ${contractNameOrAddress}`);
    }
    
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    address = artifact.address;
    abi = artifact.abi;
    
    console.log(`Loaded contract ${contractNameOrAddress} at ${address}`);
  }
  
  return {
    address,
    abi,
    read: (functionName, ...args) => readContract(address, abi, functionName, args),
    write: (functionName, ...args) => writeContract(address, abi, functionName, args),
  };
}

// Command line interface
if (require.main === module) {
  const [,, contractNameOrAddress, operation, functionName, ...args] = process.argv;
  
  if (!contractNameOrAddress || !operation || !functionName) {
    console.error('Usage: node interact-contract.js <contractNameOrAddress> <read|write> <functionName> [args...]');
    process.exit(1);
  }
  
  (async () => {
    try {
      const contract = loadContract(contractNameOrAddress);
      
      if (operation === 'read') {
        await contract.read(functionName, ...args);
      } else if (operation === 'write') {
        await contract.write(functionName, ...args);
      } else {
        console.error('Invalid operation. Use "read" or "write"');
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  })();
} else {
  // Export for use as a module
  module.exports = {
    createClients,
    loadContractAbi,
    readContract,
    writeContract,
    loadContract
  };
} 