/**
 * Example interaction script for the AdvancedVoting contract
 * This uses the secure key management system - no private key needed!
 */

// Import the interaction functions from our utility
const { readContract, writeContract } = require('./USE_THIS_CLAUDE');

/**
 * Create a new proposal in the voting contract
 * @param {string} contractNameOrAddress - Contract name or address
 * @param {string} title - Proposal title
 * @param {string} description - Proposal description
 * @param {number} durationInDays - Duration of the voting period in days
 * @param {boolean} startImmediately - Whether to start voting immediately
 */
async function createProposal(contractNameOrAddress, title, description, durationInDays, startImmediately = false) {
  console.log(`Creating proposal: "${title}"`);
  
  try {
    // Set start time to a few seconds in the future to avoid "must be in the future" error
    const currentTime = Math.floor(Date.now() / 1000);
    
    // If startImmediately is true, start a few seconds from now, otherwise start in 1 minute
    const startTime = startImmediately ? 
      currentTime + 10 : // Start 10 seconds from now
      currentTime + 60;  // Start in 1 minute
    
    const duration = durationInDays * 24 * 60 * 60; // Convert days to seconds
    
    console.log(`Voting period: ${new Date(startTime * 1000).toLocaleString()} to ${new Date((startTime + duration) * 1000).toLocaleString()}`);
    
    // Using our secure writeContract function - no private key needed!
    const result = await writeContract(
      contractNameOrAddress,
      'createProposal',
      title,
      description,
      startTime,
      duration
    );
    
    console.log('✅ Proposal created successfully!');
    return result;
  } catch (error) {
    console.error('❌ Failed to create proposal:', error.message);
  }
}

/**
 * Cast a vote on a proposal
 * @param {string} contractNameOrAddress - Contract name or address
 * @param {number} proposalId - ID of the proposal
 * @param {number} voteOption - 0=Against, 1=For, 2=Abstain
 */
async function castVote(contractNameOrAddress, proposalId, voteOption) {
  console.log(`Voting on proposal ${proposalId} with option ${voteOption}`);
  
  try {
    // Using our secure writeContract function - no private key needed!
    const result = await writeContract(
      contractNameOrAddress,
      'vote',
      proposalId,
      voteOption
    );
    
    console.log('✅ Vote cast successfully!');
    return result;
  } catch (error) {
    console.error('❌ Failed to cast vote:', error);
  }
}

/**
 * Get the details of a proposal
 * @param {string} contractNameOrAddress - Contract name or address
 * @param {number} proposalId - ID of the proposal
 */
async function getProposalDetails(contractNameOrAddress, proposalId) {
  console.log(`Getting details for proposal ${proposalId}`);
  
  try {
    // Using our secure readContract function - no private key needed!
    const details = await readContract(
      contractNameOrAddress,
      'getProposalDetails',
      proposalId
    );
    
    // Convert BigInts to Numbers for date handling
    const startTime = Number(details[2]);
    const endTime = Number(details[3]);
    
    console.log('Proposal details:');
    console.log(`- Title: ${details[0]}`);
    console.log(`- Description: ${details[1]}`);
    console.log(`- Start time: ${new Date(startTime * 1000).toLocaleString()}`);
    console.log(`- End time: ${new Date(endTime * 1000).toLocaleString()}`);
    console.log(`- Executed: ${details[4]}`);
    
    return details;
  } catch (error) {
    console.error('❌ Failed to get proposal details:', error);
  }
}

/**
 * Get the results of a proposal
 * @param {string} contractNameOrAddress - Contract name or address
 * @param {number} proposalId - ID of the proposal
 */
async function getProposalResults(contractNameOrAddress, proposalId) {
  console.log(`Getting results for proposal ${proposalId}`);
  
  try {
    // Using our secure readContract function - no private key needed!
    const results = await readContract(
      contractNameOrAddress,
      'getProposalResult',
      proposalId
    );
    
    // Convert BigInts to Numbers for display
    const votesFor = Number(results[0]);
    const votesAgainst = Number(results[1]);
    const votesAbstain = Number(results[2]);
    
    console.log('Proposal results:');
    console.log(`- Votes For: ${votesFor}`);
    console.log(`- Votes Against: ${votesAgainst}`);
    console.log(`- Votes Abstain: ${votesAbstain}`);
    console.log(`- Passed: ${results[3]}`);
    
    return results;
  } catch (error) {
    console.error('❌ Failed to get proposal results:', error);
  }
}

// Example usage if called directly
if (require.main === module) {
  // Check for command-line arguments
  const [,, action, contractNameOrAddress, ...args] = process.argv;
  
  if (!action || !contractNameOrAddress) {
    console.log(`
Voting Contract Interaction Script
----------------------------------
Usage:
  node interact-voting.js create-proposal <contractNameOrAddress> <title> <description> <durationInDays> [startImmediately]
  node interact-voting.js cast-vote <contractNameOrAddress> <proposalId> <voteOption>
  node interact-voting.js get-details <contractNameOrAddress> <proposalId>
  node interact-voting.js get-results <contractNameOrAddress> <proposalId>
    `);
    process.exit(1);
  }
  
  // Execute the requested action
  (async () => {
    try {
      switch (action) {
        case 'create-proposal':
          const startImmediately = args.length >= 4 && args[3] === 'true';
          await createProposal(contractNameOrAddress, args[0], args[1], parseInt(args[2]), startImmediately);
          break;
        case 'cast-vote':
          await castVote(contractNameOrAddress, parseInt(args[0]), parseInt(args[1]));
          break;
        case 'get-details':
          await getProposalDetails(contractNameOrAddress, parseInt(args[0]));
          break;
        case 'get-results':
          await getProposalResults(contractNameOrAddress, parseInt(args[0]));
          break;
        default:
          console.error(`Unknown action: ${action}`);
          process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  })();
}

// Export for use as a module
module.exports = {
  createProposal,
  castVote,
  getProposalDetails,
  getProposalResults
}; 