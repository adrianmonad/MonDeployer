// Script to deploy SimpleToken contract
const fs = require('fs');
const path = require('path');
const { createPublicClient, createWalletClient, http } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const os = require('os');

// Import private key from env.js
const { PRIVATE_KEY } = require('../env.js');

// Path to the SimpleToken contract
const contractPath = path.join(__dirname, 'SimpleToken.sol');
const contractSource = fs.readFileSync(contractPath, 'utf8');

// Validate private key
if (!PRIVATE_KEY) {
  console.error('PRIVATE_KEY not found in env.js');
  process.exit(1);
}

// Ensure always using exact Solidity version 0.8.28
if (!contractSource.includes('pragma solidity 0.8.28')) {
  console.error('Contract must use Solidity version 0.8.28 exactly');
  process.exit(1);
}

// Import the contract deployer utility
const { compileAndDeploy } = require('../src/utils/contract-deployer');

// Monad testnet configuration
const MONAD_RPC_URL = 'https://testnet-rpc.monad.xyz';
const MONAD_CHAIN_ID = 10143;

// Token details
const tokenName = "Example Token";
const tokenSymbol = "EXT"; 
const tokenDecimals = 18;
const initialSupply = 1000000; // 1 million tokens

async function deployToken() {
  try {
    console.log('Deploying SimpleToken with the following parameters:');
    console.log(`Name: ${tokenName}`);
    console.log(`Symbol: ${tokenSymbol}`);
    console.log(`Decimals: ${tokenDecimals}`);
    console.log(`Initial Supply: ${initialSupply}`);
    
    // Deploy the contract with explicit Solidity version 0.8.28
    const result = await compileAndDeploy(
      contractSource,
      PRIVATE_KEY,
      [tokenName, tokenSymbol, tokenDecimals, initialSupply],
      {
        contractName: 'SimpleToken',
        solcVersion: '0.8.28', // Explicitly specify Solidity version
        saveArtifacts: true
      }
    );
    
    console.log('Contract deployment successful!');
    console.log(`Contract address: ${result.address}`);
    console.log(`Transaction hash: ${result.transactionHash}`);
    console.log(`Explorer URL: https://explorer.testnet.monad.xyz/tx/${result.transactionHash}`);
    
    if (result.artifactPath) {
      console.log(`Contract artifacts saved to: ${result.artifactPath}`);
    }
    
    return result;
  } catch (error) {
    console.error('Deployment failed:', error.message);
    process.exit(1);
  }
}

// Execute deployment if run directly
if (require.main === module) {
  deployToken();
}

module.exports = { deployToken }; 