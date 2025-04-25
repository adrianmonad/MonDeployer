/**
 * Helper script to check Solidity version in a contract source string
 * 
 * Usage: 
 * const { checkVersion } = require('./check-contract-version');
 * const result = checkVersion(contractSourceCode);
 * if (!result.valid) console.error(result.error);
 */

/**
 * Check if a contract source uses the correct Solidity version
 * @param {string} source - The contract source code
 * @returns {Object} result - Result with valid flag and error message if invalid
 */
function checkVersion(source) {
  if (!source || typeof source !== 'string') {
    return {
      valid: false,
      error: 'Invalid input: source code must be a string'
    };
  }

  // Check for pragma statement
  const pragmaMatch = source.match(/pragma\s+solidity\s+([^;]+);/);
  
  if (!pragmaMatch) {
    return {
      valid: false,
      error: 'No pragma solidity statement found in contract',
      fix: 'Add: pragma solidity 0.8.28;'
    };
  }
  
  const versionSpecifier = pragmaMatch[1].trim();
  
  // Check for exact version match
  if (versionSpecifier !== '0.8.28') {
    let fix = 'Change to: pragma solidity 0.8.28;';
    
    // Identify common issues
    if (versionSpecifier.startsWith('^')) {
      fix = `Replace: pragma solidity ${versionSpecifier}; with pragma solidity 0.8.28;`;
    } else if (versionSpecifier.includes(' - ')) {
      fix = `Replace version range with exact version: pragma solidity 0.8.28;`;
    } else if (versionSpecifier.startsWith('>=')) {
      fix = `Replace: pragma solidity ${versionSpecifier}; with pragma solidity 0.8.28;`;
    }
    
    return {
      valid: false,
      error: `Invalid Solidity version: ${versionSpecifier}. Monad requires exactly version 0.8.28`,
      currentVersion: versionSpecifier,
      fix: fix
    };
  }
  
  // Success!
  return {
    valid: true,
    version: '0.8.28'
  };
}

/**
 * Fix the Solidity version in a contract source
 * @param {string} source - The contract source code
 * @returns {string} - The fixed contract source code
 */
function fixVersion(source) {
  if (!source || typeof source !== 'string') {
    throw new Error('Invalid input: source code must be a string');
  }
  
  // Check if there's a pragma statement
  const pragmaMatch = source.match(/pragma\s+solidity\s+([^;]+);/);
  
  if (pragmaMatch) {
    // Replace existing pragma statement
    return source.replace(
      /pragma\s+solidity\s+([^;]+);/, 
      'pragma solidity 0.8.28;'
    );
  } else {
    // Add pragma statement after SPDX license (if exists) or at the beginning
    const spdxMatch = source.match(/(\/\/\s*SPDX-License-Identifier:[^\n]+\n)/);
    
    if (spdxMatch) {
      return source.replace(
        spdxMatch[0],
        `${spdxMatch[0]}\npragma solidity 0.8.28;\n`
      );
    } else {
      return `pragma solidity 0.8.28;\n\n${source}`;
    }
  }
}

// Run as standalone script if called directly
if (require.main === module) {
  const fs = require('fs');
  const contractPath = process.argv[2];
  
  if (!contractPath) {
    console.error('Please provide a contract file path');
    process.exit(1);
  }
  
  try {
    const source = fs.readFileSync(contractPath, 'utf8');
    const result = checkVersion(source);
    
    if (result.valid) {
      console.log(`✅ Contract uses correct Solidity version: ${result.version}`);
    } else {
      console.error(`❌ ${result.error}`);
      console.error(`📝 ${result.fix}`);
      
      // Offer to fix the version
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      readline.question('Do you want to fix the version? (y/n) ', answer => {
        if (answer.toLowerCase() === 'y') {
          const fixed = fixVersion(source);
          fs.writeFileSync(contractPath, fixed);
          console.log('✅ Fixed Solidity version in the contract');
        }
        readline.close();
      });
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { checkVersion, fixVersion }; 