const fs = require('fs');
const path = require('path');
const viem = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { monadTestnet } = require('viem/chains');
const { PRIVATE_KEY } = require('../env.js');

// Process command line arguments
const args = process.argv.slice(2);
const command = args[0];
const param = args[1];

// Validate private key
if (!PRIVATE_KEY) {
  console.error('❌ Error: PRIVATE_KEY not found in env.js');
  process.exit(1);
}

// Load contract artifacts
const artifactsPath = path.join(__dirname, '../artifacts/MySimpleContract.json');
if (!fs.existsSync(artifactsPath)) {
  console.error('❌ Contract artifacts not found. Please deploy the contract first.');
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
  
  try {
    const message = await publicClient.readContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'getMessage',
    });
    
    console.log(`📄 Current message: "${message}"\n`);
    return message;
  } catch (error) {
    console.error('❌ Error reading message:', error.message);
  }
}

async function setMessage(newMessage) {
  if (!newMessage) {
    console.error('❌ Error: No message provided. Usage: node contract-cli.js set-message "Your message here"');
    return;
  }
  
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
  
  try {
    const counter = await publicClient.readContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'counter',
    });
    
    console.log(`🔢 Current counter value: ${counter}\n`);
    return counter;
  } catch (error) {
    console.error('❌ Error reading counter:', error.message);
  }
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
  
  try {
    const owner = await publicClient.readContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'owner',
    });
    
    console.log(`👤 Contract owner: ${owner}`);
    console.log(`👤 Your address: ${account.address}`);
    console.log(`🔑 You ${owner.toLowerCase() === account.address.toLowerCase() ? 'are' : 'are NOT'} the owner of this contract.\n`);
    
    return owner;
  } catch (error) {
    console.error('❌ Error getting owner:', error.message);
  }
}

async function showHelp() {
  console.log(`
🔧 MySimpleContract CLI - Contract Address: ${contractAddress}

Available commands:
  get-message        - Show the current message
  set-message <text> - Set a new message (owner only)
  get-counter        - Show the current counter value
  increment-counter  - Increment the counter
  get-owner          - Show the contract owner
  help               - Show this help message

Examples:
  node contract-cli.js get-message
  node contract-cli.js set-message "Hello, blockchain!"
  node contract-cli.js increment-counter
  `);
}

// Process the command
async function processCommand() {
  if (!command || command === 'help') {
    showHelp();
    return;
  }

  switch (command) {
    case 'get-message':
      await getMessage();
      break;
    case 'set-message':
      await setMessage(param);
      break;
    case 'get-counter':
      await getCounter();
      break;
    case 'increment-counter':
      await incrementCounter();
      break;
    case 'get-owner':
      await getOwner();
      break;
    default:
      console.error(`❌ Unknown command: ${command}`);
      showHelp();
  }
}

// Execute the command
processCommand().catch(console.error); 