#!/usr/bin/env node

// Load environment variables from .env file
require('dotenv').config();

// Check for required private key
if (!process.env.PRIVATE_KEY) {
  console.error('❌ PRIVATE_KEY not found in environment variables.');
  console.error('Please ensure your .env file contains a PRIVATE_KEY entry with your private key.');
  console.error('Example: PRIVATE_KEY=your_private_key_here (without 0x prefix)');
  process.exit(1);
}

const { spawn } = require('child_process');
const path = require('path');

// Function to run a script and wait for it to complete
function runScript(scriptName) {
  return new Promise((resolve, reject) => {
    console.log(`\n🚀 Running ${scriptName}...\n`);
    
    const scriptPath = path.join(__dirname, scriptName);
    const child = spawn('node', [scriptPath], { 
      stdio: 'inherit',
      env: process.env
    });
    
    child.on('exit', (code) => {
      if (code === 0) {
        console.log(`\n✅ ${scriptName} completed successfully\n`);
        resolve();
      } else {
        console.error(`\n❌ ${scriptName} failed with exit code ${code}\n`);
        reject(new Error(`Script ${scriptName} failed with exit code ${code}`));
      }
    });
    
    child.on('error', (err) => {
      console.error(`\n❌ Error executing ${scriptName}: ${err.message}\n`);
      reject(err);
    });
  });
}

// Main function to run all scripts
async function main() {
  try {
    console.log('===============================================');
    console.log('🗳️  ENHANCED VOTING CONTRACT DEMO');
    console.log('===============================================\n');
    console.log('This demo will:');
    console.log('1. Deploy the EnhancedVoting contract to Monad testnet');
    console.log('2. Interact with the contract to show voting functionality');
    console.log('===============================================\n');
    
    // First deploy the contract
    await runScript('deploy-enhanced-voting.js');
    
    // Then interact with it
    await runScript('interact-enhanced-voting.js');
    
    console.log('===============================================');
    console.log('🎉 DEMO COMPLETED SUCCESSFULLY');
    console.log('===============================================\n');
    console.log('To give voting rights to another address:');
    console.log('node examples/give-voting-rights.js <address>');
    console.log('\nTo interact with the contract again:');
    console.log('node examples/interact-enhanced-voting.js');
    console.log('===============================================');
    
  } catch (error) {
    console.error('❌ Demo failed:', error.message);
    process.exit(1);
  }
}

// Run main function
main().catch(console.error); 