const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { compileAndDeploy } = require('../dist/utils/contract-deployer.js');

// Load environment variables
dotenv.config();

// Read the contract source
const contractPath = path.join(__dirname, 'VotingContract.sol');
const sourceCode = fs.readFileSync(contractPath, 'utf8');

// Get private key from environment variables
const privateKey = process.env.PRIVATE_KEY;

// Validate private key
if (!privateKey) {
  console.error('❌ Error: PRIVATE_KEY not found in environment variables.');
  console.error('Please run "npm run setup" to configure your environment variables.');
  process.exit(1);
}

// Initial proposals for the voting contract
const initialProposals = ['Proposal A', 'Proposal B', 'Proposal C'];

async function deploy() {
  try {
    console.log('Deploying SimpleVoting contract to Monad testnet...');
    console.log(`Initial proposals: ${initialProposals.join(', ')}`);
    
    const result = await compileAndDeploy(
      sourceCode,
      privateKey,
      [initialProposals], // Constructor arguments
      {
        contractName: 'SimpleVoting',
        saveArtifacts: true
      }
    );
    
    console.log('\n✅ Voting contract deployed successfully!');
    console.log(`📝 Contract Address: ${result.address}`);
    console.log(`🔗 Transaction Hash: ${result.transactionHash}`);
    console.log(`💾 Contract artifacts saved to: ${result.artifactPath}`);
    console.log('\nContract Usage:');
    console.log('1. To cast a vote:');
    console.log(`   contract.vote(proposalIndex) // 0, 1, or 2 for ${initialProposals.join(', ')}`);
    console.log('2. To check the winning proposal:');
    console.log('   contract.winnerName()');
    console.log('3. To get proposal details:');
    console.log('   contract.getProposal(proposalIndex)');
    
    return result;
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
  }
}

// Run deployment
deploy().catch(console.error); 