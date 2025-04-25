#!/usr/bin/env node

/**
 * Script to check Solidity version in contract files
 * 
 * Usage: node scripts/check-solidity-version.js <contract-file>
 */

const fs = require('fs');
const path = require('path');

// Required Solidity version for Monad
const REQUIRED_VERSION = '0.8.28';

// Check if a file path was provided
const contractPath = process.argv[2];
if (!contractPath) {
  console.error('\x1b[31mError: No contract file specified\x1b[0m');
  console.error('Usage: node scripts/check-solidity-version.js <contract-file>');
  process.exit(1);
}

// Check if the file exists
const resolvedPath = path.resolve(contractPath);
if (!fs.existsSync(resolvedPath)) {
  console.error(`\x1b[31mError: File not found: ${resolvedPath}\x1b[0m`);
  process.exit(1);
}

// Read the contract file
try {
  const contractSource = fs.readFileSync(resolvedPath, 'utf8');
  
  // Check for pragma statement
  const pragmaMatch = contractSource.match(/pragma\s+solidity\s+([^;]+);/);
  
  if (!pragmaMatch) {
    console.error('\x1b[31mError: No pragma solidity statement found in contract\x1b[0m');
    console.error(`Add the following line at the top of your contract:`);
    console.error(`\x1b[32mpragma solidity ${REQUIRED_VERSION};\x1b[0m`);
    process.exit(1);
  }
  
  const versionSpecifier = pragmaMatch[1].trim();
  
  // Check for exact version match
  if (versionSpecifier !== REQUIRED_VERSION) {
    console.error(`\x1b[31mError: Invalid Solidity version: ${versionSpecifier}\x1b[0m`);
    console.error(`Monad requires exactly version ${REQUIRED_VERSION}`);
    console.error(`Change your pragma statement to:`);
    console.error(`\x1b[32mpragma solidity ${REQUIRED_VERSION};\x1b[0m`);
    
    // Show common issues
    if (versionSpecifier.startsWith('^')) {
      console.error(`\nRemove the caret (^) from the version specifier.`);
      console.error(`\x1b[31m- pragma solidity ${versionSpecifier};\x1b[0m`);
      console.error(`\x1b[32m+ pragma solidity ${REQUIRED_VERSION};\x1b[0m`);
    } else if (versionSpecifier.includes(' - ')) {
      console.error(`\nDo not use version ranges.`);
      console.error(`\x1b[31m- pragma solidity ${versionSpecifier};\x1b[0m`);
      console.error(`\x1b[32m+ pragma solidity ${REQUIRED_VERSION};\x1b[0m`);
    } else if (versionSpecifier.startsWith('>=')) {
      console.error(`\nDo not use >=, use exact version.`);
      console.error(`\x1b[31m- pragma solidity ${versionSpecifier};\x1b[0m`);
      console.error(`\x1b[32m+ pragma solidity ${REQUIRED_VERSION};\x1b[0m`);
    }
    
    process.exit(1);
  }
  
  // Success!
  console.log(`\x1b[32m✓ Contract uses correct Solidity version: ${REQUIRED_VERSION}\x1b[0m`);
  console.log(`File: ${resolvedPath}`);
  
} catch (error) {
  console.error(`\x1b[31mError reading contract file: ${error.message}\x1b[0m`);
  process.exit(1);
} 