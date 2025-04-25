// Load environment variables from .env file
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { compileAndDeploy } = require('../dist/utils/contract-deployer.js');
// Import private key directly from env.js instead of process.env
const { PRIVATE_KEY } = require('../env.js');

// Read the contract source
const contractPath = path.join(__dirname, 'EnhancedVotingContract.sol');
const sourceCode = fs.readFileSync(contractPath, 'utf8');

// Proposal data for the voting contract
const proposalNames = ['Climate Initiative', 'Education Reform', 'Healthcare Improvement'];
const proposalDescriptions = [
  'Fund renewable energy projects and reduce carbon emissions',
  'Improve access to education and modernize teaching methods',
  'Expand healthcare coverage and reduce medical costs'
];
const votingDurationInMinutes = 60; // 1 hour voting period

async function deploy() {
  try {
    // Validate that PRIVATE_KEY exists in env.js
    if (!PRIVATE_KEY) {
      throw new Error(
        'PRIVATE_KEY not found in env.js.\n' +
        'Please ensure your env.js file contains a PRIVATE_KEY entry with your private key.\n' +
        'Example: module.exports = { PRIVATE_KEY: "your_private_key_here" };'
      );
    }
    
    // Do not log the private key anywhere!
    console.log('Deploying EnhancedVoting contract to Monad testnet...');
    console.log(`Proposals: ${proposalNames.join(', ')}`);
    console.log(`Voting duration: ${votingDurationInMinutes} minutes`);
    
    const result = await compileAndDeploy(
      sourceCode,
      PRIVATE_KEY, // Use private key from env.js directly
      [proposalNames, proposalDescriptions, votingDurationInMinutes], // Constructor arguments
      {
        contractName: 'EnhancedVoting',
        saveArtifacts: true
      }
    );
    
    console.log('\n✅ EnhancedVoting contract deployed successfully!');
    console.log(`📝 Contract Address: ${result.address}`);
    console.log(`🔗 Transaction Hash: ${result.transactionHash}`);
    console.log(`💾 Contract artifacts saved to: ${result.artifactPath}`);
    console.log('\nContract Usage:');
    console.log('1. To cast a vote:');
    console.log(`   contract.vote(proposalIndex) // 0, 1, or 2 for ${proposalNames.join(', ')}`);
    console.log('2. To delegate your vote:');
    console.log('   contract.delegate(address)');
    console.log('3. To check the winning proposal:');
    console.log('   contract.winnerName()');
    console.log('4. To check voting time remaining:');
    console.log('   contract.votingTimeRemaining()');
    
    return result;
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    process.exit(1);
  }
}

// Run deployment
deploy().catch(console.error); 