const fs = require('fs');
const path = require('path');
const solc = require('solc');
const viem = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { monadTestnet } = require('viem/chains');
const { PRIVATE_KEY } = require('../env.js');

// Get the contract source
const contractPath = path.join(__dirname, 'MySimpleContract.sol');
const contractSource = fs.readFileSync(contractPath, 'utf8');

// Validate private key
if (!PRIVATE_KEY) {
  console.error('❌ Error: PRIVATE_KEY not found in env.js');
  process.exit(1);
}

// Extract the contract name
const contractName = 'MySimpleContract';

async function compile() {
  console.log(`Compiling ${contractName}...`);
  
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

  // Compile using the local solc instance
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  
  // Check for compilation errors
  if (output.errors) {
    const errors = output.errors.filter(error => error.severity === 'error');
    if (errors.length > 0) {
      console.error('❌ Compilation errors:');
      errors.forEach(error => console.error(error.formattedMessage));
      process.exit(1);
    }
  }
  
  // Get the contract data
  const contractOutput = output.contracts[contractName][contractName];
  return {
    abi: contractOutput.abi,
    bytecode: `0x${contractOutput.evm.bytecode.object}`
  };
}

async function deploy(abi, bytecode) {
  try {
    console.log('Deploying to Monad testnet...');
    
    // Normalize private key (remove 0x prefix if present)
    const normalizedKey = PRIVATE_KEY.replace(/^0x/, '');
    
    // Create account from private key
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
    
    // Deploy the contract
    const initialMessage = "Hello, Monad!";
    
    console.log(`Deploying from address: ${account.address}`);
    
    const hash = await walletClient.deployContract({
      abi,
      bytecode,
      args: [initialMessage],
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
    const artifactsDir = path.join(__dirname, '../artifacts');
    
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }
    
    const artifactPath = path.join(artifactsDir, `${contractName}.json`);
    fs.writeFileSync(
      artifactPath,
      JSON.stringify({
        contractName,
        abi,
        address: receipt.contractAddress,
        deployedAt: new Date().toISOString(),
      }, null, 2)
    );
    
    console.log(`💾 Contract artifacts saved to: ${artifactPath}`);
    
    return {
      address: receipt.contractAddress,
      transactionHash: hash
    };
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    if (error.cause) {
      console.error('Cause:', error.cause);
    }
  }
}

async function main() {
  try {
    const { abi, bytecode } = await compile();
    await deploy(abi, bytecode);
  } catch (error) {
    console.error('Error:', error);
  }
}

main(); 