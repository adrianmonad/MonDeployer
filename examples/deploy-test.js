const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { compileAndDeploy } = require('../dist/utils/contract-deployer.js');

// Load environment variables
dotenv.config();

// Read the contract source
const contractPath = path.join(__dirname, 'SimpleStorage.sol');
const sourceCode = fs.readFileSync(contractPath, 'utf8');

// Get private key from environment variables
const privateKey = process.env.PRIVATE_KEY;

// Validate private key
if (!privateKey) {
  console.error('❌ Error: PRIVATE_KEY not found in environment variables.');
  console.error('Please create a .env file in the project root with your private key:');
  console.error('PRIVATE_KEY=your_private_key_here');
  process.exit(1);
}

async function deploy() {
  try {
    console.log('Deploying SimpleStorage contract to Monad testnet...');
    
    const result = await compileAndDeploy(
      sourceCode,
      privateKey,
      [42], // Constructor arguments (initial value = 42)
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