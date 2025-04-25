const fs = require('fs');
const path = require('path');
const solc = require('solc');
const { compileAndDeploy } = require('../dist/utils/contract-deployer.js');
const { PRIVATE_KEY } = require('../env.js');

// Check solc version
console.log(`Using Solidity compiler version: ${solc.version()}`);

// Read the contract source
const contractPath = path.join(__dirname, 'MySimpleContract.sol');
const sourceCode = fs.readFileSync(contractPath, 'utf8');

// Validate private key
if (!PRIVATE_KEY) {
  console.error('❌ Error: PRIVATE_KEY not found in env.js');
  console.error('Please make sure env.js exists in the project root with your private key:');
  console.error('module.exports = { PRIVATE_KEY: "your_private_key_here" };');
  process.exit(1);
}

async function deploy() {
  try {
    console.log('Deploying MySimpleContract to Monad testnet...');
    
    const result = await compileAndDeploy(
      sourceCode,
      PRIVATE_KEY,
      ["Hello, Monad!"], // Constructor arguments (initial message)
      {
        saveArtifacts: true
      }
    );
    
    console.log('✅ Contract deployed successfully!');
    console.log(`📝 Contract Address: ${result.address}`);
    console.log(`🔗 Transaction Hash: ${result.transactionHash}`);
    console.log(`💾 Contract artifacts saved to: ${result.artifactPath}`);
    
    return result;
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
  }
}

// Run deployment
deploy().catch(console.error); 