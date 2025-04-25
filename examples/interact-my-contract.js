const fs = require('fs');
const path = require('path');
const viem = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { monadTestnet } = require('viem/chains');
const { PRIVATE_KEY } = require('../env.js');

// Load contract artifacts
const artifactsPath = path.join(__dirname, '../artifacts/MySimpleContract.json');
if (!fs.existsSync(artifactsPath)) {
  console.error('❌ Contract artifacts not found. Please deploy the contract first.');
  process.exit(1);
}

// Validate private key
if (!PRIVATE_KEY) {
  console.error('❌ Error: PRIVATE_KEY not found in env.js');
  process.exit(1);
}

const artifacts = JSON.parse(fs.readFileSync(artifactsPath, 'utf8'));
const contractAddress = artifacts.address;
const contractAbi = artifacts.abi;

// Normalize private key and create account
const normalizedKey = PRIVATE_KEY.replace(/^0x/, '');
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

// Contract interaction functions
async function getMessage() {
  console.log('📖 Reading the current message...');
  
  const message = await publicClient.readContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'getMessage',
  });
  
  console.log(`📄 Current message: "${message}"\n`);
  return message;
}

async function setMessage(newMessage) {
  console.log(`✏️ Setting a new message: "${newMessage}"`);
  
  try {
    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'setMessage',
      args: [newMessage],
    });
    
    console.log(`🔗 Transaction hash: ${hash}`);
    
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log('✅ Message updated successfully!\n');
    
    return receipt;
  } catch (error) {
    console.error('❌ Error setting message:', error.message);
    if (error.message.includes('Not the contract owner')) {
      console.error('You are not the owner of the contract. Only the owner can set the message.');
    }
  }
}

async function getCounter() {
  console.log('🔢 Reading the current counter value...');
  
  const counter = await publicClient.readContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'counter',
  });
  
  console.log(`🔢 Current counter value: ${counter}\n`);
  return counter;
}

async function incrementCounter() {
  console.log('➕ Incrementing the counter...');
  
  try {
    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'incrementCounter',
    });
    
    console.log(`🔗 Transaction hash: ${hash}`);
    
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log('✅ Counter incremented successfully!\n');
    
    return receipt;
  } catch (error) {
    console.error('❌ Error incrementing counter:', error.message);
  }
}

async function getOwner() {
  console.log('👤 Getting contract owner...');
  
  const owner = await publicClient.readContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'owner',
  });
  
  console.log(`👤 Contract owner: ${owner}`);
  console.log(`👤 Your address: ${account.address}`);
  console.log(`🔑 You ${owner.toLowerCase() === account.address.toLowerCase() ? 'are' : 'are NOT'} the owner of this contract.\n`);
  
  return owner;
}

// Run the demo
async function runDemo() {
  console.log('🚀 Starting interaction with MySimpleContract');
  console.log(`📝 Contract address: ${contractAddress}\n`);
  
  // Get the contract owner
  await getOwner();
  
  // Get initial message
  await getMessage();
  
  // Set a new message
  await setMessage("Hello from Claude!");
  
  // Get the updated message
  await getMessage();
  
  // Get the initial counter
  await getCounter();
  
  // Increment counter a few times
  await incrementCounter();
  await incrementCounter();
  
  // Get the updated counter
  await getCounter();
  
  console.log('✨ Demo completed!');
}

// Run the demo
runDemo().catch(console.error); 