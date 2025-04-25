/**
 * Example contract deployment script for Monad
 * 
 * IMPORTANT: All contracts MUST use Solidity version 0.8.28 exactly
 */
const fs = require('fs');
const path = require('path');
const { compileAndDeploy } = require('../src/utils/contract-deployer');

// Import private key from env.js
const { PRIVATE_KEY } = require('../env.js');

// Validate private key
if (!PRIVATE_KEY) {
  console.error('PRIVATE_KEY not found in env.js');
  process.exit(1);
}

// -----------------------------------------------------
// EDIT THESE VALUES FOR YOUR CONTRACT
// -----------------------------------------------------

// Path to your contract file
const CONTRACT_PATH = path.join(__dirname, 'YourContract.sol');

// Contract constructor arguments (if any)
const CONSTRUCTOR_ARGS = [
  // Add your constructor arguments here
  // For example: "My Token", "MTK", 18, 1000000
];

// Optional: Override contract name (if different from file name)
const CONTRACT_NAME = null; // Set to contract name or leave as null to extract from source

// -----------------------------------------------------
// DO NOT EDIT BELOW THIS LINE
// -----------------------------------------------------

async function deployContract() {
  try {
    // Read contract source
    const contractSource = fs.readFileSync(CONTRACT_PATH, 'utf8');
    
    // Enforce Solidity version 0.8.28
    if (!contractSource.includes('pragma solidity 0.8.28')) {
      console.error('\x1b[31mERROR: Contract must use Solidity version 0.8.28 exactly\x1b[0m');
      console.error('Please change your pragma statement to:');
      console.error('\x1b[32mpragma solidity 0.8.28;\x1b[0m');
      console.error('Other versions like ^0.8.0 will cause deployment errors.');
      process.exit(1);
    }
    
    console.log('Compiling and deploying contract...');
    
    // Deploy the contract
    const result = await compileAndDeploy(
      contractSource,
      PRIVATE_KEY,
      CONSTRUCTOR_ARGS,
      {
        contractName: CONTRACT_NAME,
        solcVersion: '0.8.28', // Always specify 0.8.28 for Monad
        saveArtifacts: true
      }
    );
    
    // Display deployment results
    console.log('\n✅ Contract deployment successful!');
    console.log('==========================================');
    console.log(`📄 Contract Name: ${result.contractName}`);
    console.log(`📫 Contract Address: ${result.address}`);
    console.log(`🔗 Transaction Hash: ${result.transactionHash}`);
    console.log(`🌐 Explorer URL: https://explorer.testnet.monad.xyz/tx/${result.transactionHash}`);
    
    if (result.artifactPath) {
      console.log(`💾 Contract artifacts saved to: ${result.artifactPath}`);
    }
    
    return result;
  } catch (error) {
    console.error('\n❌ Deployment failed:');
    console.error(error.message);
    process.exit(1);
  }
}

// Run deployment if script is executed directly
if (require.main === module) {
  deployContract();
}

module.exports = { deployContract }; 