// Load environment variables from .env file
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createPublicClient, createWalletClient, http } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { monadTestnet } = require('viem/chains');
// Import private key directly from env.js instead of process.env
const { PRIVATE_KEY } = require('../env.js');

// Get the contract address and ABI
let contractAddress;
let contractABI;

// Get voter address from command line arguments
const voterAddress = process.argv[2];

if (!voterAddress) {
  console.error('❌ Error: No voter address provided');
  console.error('Usage: node examples/give-voting-rights.js <voter-address>');
  console.error('Example: node examples/give-voting-rights.js 0x1234567890123456789012345678901234567890');
  process.exit(1);
}

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

// Create clients
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

async function main() {
  try {
    // Check if caller is chairperson
    const chairperson = await publicClient.readContract({
      address: contractAddress,
      abi: contractABI,
      functionName: 'chairperson',
    });
    
    if (chairperson.toLowerCase() !== account.address.toLowerCase()) {
      console.error('❌ Error: Only the chairperson can give voting rights');
      console.error(`Chairperson address: ${chairperson}`);
      console.error(`Your address: ${account.address}`);
      process.exit(1);
    }
    
    console.log(`🔑 Giving voting rights to: ${voterAddress}`);
    
    // Check if voting has ended
    const hasEnded = await publicClient.readContract({
      address: contractAddress,
      abi: contractABI,
      functionName: 'hasVotingEnded',
    });
    
    if (hasEnded) {
      console.error('❌ Error: Voting period has already ended');
      process.exit(1);
    }
    
    // Check if voter already has voting rights
    const voter = await publicClient.readContract({
      address: contractAddress,
      abi: contractABI,
      functionName: 'voters',
      args: [voterAddress],
    });
    
    if (voter.weight > 0) {
      console.error('❌ Error: Voter already has voting rights');
      process.exit(1);
    }
    
    // Give voting rights
    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: contractABI,
      functionName: 'giveRightToVote',
      args: [voterAddress],
    });
    
    console.log(`✅ Transaction sent: ${hash}`);
    
    // Wait for transaction to be mined
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`✅ Voting rights granted in block ${receipt.blockNumber}`);
    
    // Verify the voter now has voting rights
    const updatedVoter = await publicClient.readContract({
      address: contractAddress,
      abi: contractABI,
      functionName: 'voters',
      args: [voterAddress],
    });
    
    if (updatedVoter.weight > 0) {
      console.log(`🎉 Voter ${voterAddress} now has voting rights with weight: ${updatedVoter.weight}`);
    } else {
      console.error('❌ Error: Failed to grant voting rights');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

main().catch(console.error); 