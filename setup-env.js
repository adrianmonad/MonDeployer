#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let ENV_PATH = path.join(__dirname, '.env');

// Check if .env file already exists
if (fs.existsSync(ENV_PATH)) {
  console.log('⚠️  A .env file already exists. Creating .env.new instead.');
  ENV_PATH = path.join(__dirname, '.env.new');
}

console.log('🔐 Monad Contract Deployment Environment Setup');
console.log('=============================================');
console.log('This script will help you set up the environment variables needed for contract deployment.');
console.log('The private key should be entered WITHOUT the 0x prefix.\n');

const promptPrivateKey = () => {
  rl.question('Enter your private key for Monad testnet deployment: ', (privateKey) => {
    // Remove 0x prefix if present
    privateKey = privateKey.replace(/^0x/, '');
    
    // Validate private key format
    if (!/^[0-9a-fA-F]{64}$/.test(privateKey)) {
      console.log('❌ Invalid private key format. The private key must be a 64-character hex string.');
      return promptPrivateKey();
    }
    
    rl.question('Enter Solidity compiler version (default: 0.8.19): ', (solcVersion) => {
      solcVersion = solcVersion || '0.8.19';
      
      rl.question('Enter optimization runs (default: 200): ', (runs) => {
        runs = runs || '200';
        
        // Create the .env file content
        const envContent = `# Monad testnet deployment private key (without 0x prefix)
PRIVATE_KEY=${privateKey}

# Solidity compiler configuration
SOLIDITY_VERSION=${solcVersion}
OPTIMIZATION_RUNS=${runs}
`;
        
        // Write to the .env file
        fs.writeFileSync(ENV_PATH, envContent);
        
        console.log(`\n✅ Environment file created at: ${ENV_PATH}`);
        console.log('⚠️  Please keep this file secure and NEVER commit it to version control!\n');
        
        rl.close();
      });
    });
  });
};

promptPrivateKey(); 