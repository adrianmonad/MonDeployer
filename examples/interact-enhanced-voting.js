// Load environment variables from .env file
require('dotenv').config();
const { createPublicClient, createWalletClient, http } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { monadTestnet } = require('viem/chains');
const fs = require('fs');
const path = require('path');
const { PRIVATE_KEY } = require('../env.js');

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];
const parameter = args[1];

// Load contract information
let contractAddress;
let contractABI;

try {
  // Attempt to load contract data from temp directory (saved during deployment)
  const tempDir = require('os').tmpdir();
  const artifactPath = path.join(tempDir, 'monad-deployments', 'EnhancedVoting.json');
  
  if (fs.existsSync(artifactPath)) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    contractAddress = artifact.address;
    contractABI = artifact.abi;
    console.log(`✅ Loaded contract from artifacts: ${contractAddress}`);
  } else {
    throw new Error('Contract artifact not found. Please deploy the contract first with deploy-enhanced-voting.js');
  }
} catch (error) {
  console.error('❌ Error loading contract:', error.message);
  console.error('Please deploy the contract first with: node examples/deploy-enhanced-voting.js');
  process.exit(1);
}

// Validate private key exists
if (!PRIVATE_KEY) {
  console.error('❌ PRIVATE_KEY not found in env.js.');
  console.error('Please ensure your env.js file contains a PRIVATE_KEY entry with your private key.');
  console.error('Example: module.exports = { PRIVATE_KEY: "your_private_key_here" };');
  process.exit(1);
}

// Create account and clients
const account = privateKeyToAccount(`0x${PRIVATE_KEY.replace(/^0x/, '')}`);

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http('https://rpc.monad.xyz/testnet'),
});

const walletClient = createWalletClient({
  account,
  chain: monadTestnet,
  transport: http('https://rpc.monad.xyz/testnet'),
});

// Main function to handle different commands
async function main() {
  console.log(`🔑 Connected with address: ${account.address}`);

  try {
    switch (command) {
      case 'vote':
        if (!parameter) {
          console.error('❌ Missing proposal ID. Usage: node examples/interact-enhanced-voting.js vote [proposalId]');
          process.exit(1);
        }
        await vote(parseInt(parameter));
        break;
        
      case 'give-rights':
        if (!parameter) {
          console.error('❌ Missing voter address. Usage: node examples/interact-enhanced-voting.js give-rights [address]');
          process.exit(1);
        }
        await giveVotingRights(parameter);
        break;
        
      case 'proposals':
        await getProposals();
        break;
        
      case 'winner':
        await getWinner();
        break;
        
      case 'voting-info':
        await getVotingInfo();
        break;

      case 'voter-info':
        if (!parameter) {
          console.error('❌ Missing voter address. Usage: node examples/interact-enhanced-voting.js voter-info [address]');
          process.exit(1);
        }
        await getVoterInfo(parameter);
        break;
        
      default:
        console.log('Available commands:');
        console.log('  vote [proposalId] - Vote for a proposal');
        console.log('  give-rights [address] - Give voting rights to an address');
        console.log('  proposals - List all proposals');
        console.log('  winner - Get the winning proposal');
        console.log('  voting-info - Get information about the voting');
        console.log('  voter-info [address] - Get information about a voter');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Vote for a proposal
async function vote(proposalId) {
  console.log(`🗳️ Voting for proposal ${proposalId}...`);
  
  try {
    const { request } = await publicClient.simulateContract({
      address: contractAddress,
      abi: contractABI,
      functionName: 'vote',
      args: [proposalId],
      account
    });
    
    const hash = await walletClient.writeContract(request);
    console.log(`✅ Vote transaction submitted: ${hash}`);
    
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`✅ Vote confirmed in block ${receipt.blockNumber}`);
  } catch (error) {
    console.error('❌ Error voting:', error.message);
    
    if (error.message.includes('voting is not open')) {
      console.error('Voting period is not currently open');
    } else if (error.message.includes('has no right to vote')) {
      console.error('You do not have voting rights');
    } else if (error.message.includes('already voted')) {
      console.error('You have already voted');
    } else if (error.message.includes('invalid proposal')) {
      console.error('Invalid proposal ID');
    }
  }
}

// Give voting rights to an address
async function giveVotingRights(voterAddress) {
  console.log(`🔑 Giving voting rights to ${voterAddress}...`);
  
  try {
    const { request } = await publicClient.simulateContract({
      address: contractAddress,
      abi: contractABI,
      functionName: 'giveRightToVote',
      args: [voterAddress],
      account
    });
    
    const hash = await walletClient.writeContract(request);
    console.log(`✅ Transaction submitted: ${hash}`);
    
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`✅ Rights granted in block ${receipt.blockNumber}`);
  } catch (error) {
    console.error('❌ Error giving voting rights:', error.message);
    
    if (error.message.includes('Only chairperson')) {
      console.error('Only the chairperson can give voting rights');
    } else if (error.message.includes('The voter already voted')) {
      console.error('The voter has already voted');
    } else if (error.message.includes('voting period has ended')) {
      console.error('The voting period has ended');
    }
  }
}

// Get all proposals
async function getProposals() {
  console.log('📋 Getting proposals...');
  
  try {
    const proposalCount = await publicClient.readContract({
      address: contractAddress,
      abi: contractABI,
      functionName: 'getProposalCount'
    });
    
    console.log(`Found ${proposalCount} proposals:`);
    
    for (let i = 0; i < proposalCount; i++) {
      const proposal = await publicClient.readContract({
        address: contractAddress,
        abi: contractABI,
        functionName: 'proposals',
        args: [i]
      });
      
      console.log(`Proposal ${i}: "${proposal.name}" - ${proposal.voteCount} votes`);
    }
  } catch (error) {
    console.error('❌ Error getting proposals:', error.message);
  }
}

// Get the winning proposal
async function getWinner() {
  console.log('🏆 Getting the winning proposal...');
  
  try {
    const winningProposalId = await publicClient.readContract({
      address: contractAddress,
      abi: contractABI,
      functionName: 'winningProposal'
    });
    
    const winnerName = await publicClient.readContract({
      address: contractAddress,
      abi: contractABI,
      functionName: 'winnerName'
    });
    
    console.log(`🎉 Winning proposal: #${winningProposalId} - "${winnerName}"`);
  } catch (error) {
    console.error('❌ Error getting winner:', error.message);
    
    if (error.message.includes('voting is still open')) {
      console.error('Voting is still open, no winner can be determined yet');
    }
  }
}

// Get information about the voting
async function getVotingInfo() {
  console.log('ℹ️ Getting voting information...');
  
  try {
    const chairperson = await publicClient.readContract({
      address: contractAddress,
      abi: contractABI,
      functionName: 'chairperson'
    });
    
    const votingOpen = await publicClient.readContract({
      address: contractAddress,
      abi: contractABI,
      functionName: 'votingOpen'
    });
    
    const startTime = await publicClient.readContract({
      address: contractAddress,
      abi: contractABI,
      functionName: 'votingStartTime'
    });
    
    const endTime = await publicClient.readContract({
      address: contractAddress,
      abi: contractABI,
      functionName: 'votingEndTime'
    });
    
    const proposalCount = await publicClient.readContract({
      address: contractAddress,
      abi: contractABI,
      functionName: 'getProposalCount'
    });
    
    console.log(`Contract address: ${contractAddress}`);
    console.log(`Chairperson: ${chairperson}`);
    console.log(`Voting open: ${votingOpen ? 'Yes' : 'No'}`);
    console.log(`Voting period: ${new Date(Number(startTime) * 1000).toLocaleString()} to ${new Date(Number(endTime) * 1000).toLocaleString()}`);
    console.log(`Number of proposals: ${proposalCount}`);
  } catch (error) {
    console.error('❌ Error getting voting info:', error.message);
  }
}

// Get information about a voter
async function getVoterInfo(voterAddress) {
  console.log(`👤 Getting information for voter ${voterAddress}...`);
  
  try {
    const voter = await publicClient.readContract({
      address: contractAddress,
      abi: contractABI,
      functionName: 'voters',
      args: [voterAddress]
    });
    
    console.log(`Voter: ${voterAddress}`);
    console.log(`Has voting rights: ${voter.weight > 0 ? 'Yes' : 'No'}`);
    console.log(`Weight: ${voter.weight}`);
    console.log(`Has voted: ${voter.voted ? 'Yes' : 'No'}`);
    
    if (voter.voted) {
      console.log(`Voted for proposal: ${voter.vote}`);
    }
  } catch (error) {
    console.error('❌ Error getting voter info:', error.message);
  }
}

main()
  .catch(console.error)
  .finally(() => process.exit()); 