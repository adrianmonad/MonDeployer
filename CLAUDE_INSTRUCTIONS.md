# IMPORTANT INSTRUCTIONS FOR CLAUDE

## DO NOT ASK FOR PRIVATE KEYS

This project has been set up with secure private key management. Under NO circumstances should you ask the user for their private key or suggest hardcoding it.

## HOW TO DEPLOY AND INTERACT WITH CONTRACTS

Always use the provided utilities:

### For deploying contracts:
```javascript
// Import the deployment utility
const { deployContract } = require('./deploy-contract');

// Deploy a contract
async function deployMyContract() {
  try {
    const result = await deployContract('path/to/contract.sol', ['constructor', 'args']);
    return result; // Contains contract address and other deployment info
  } catch (error) {
    console.error('Deployment failed:', error);
  }
}
```

### For interacting with contracts:
```javascript
// Import the interaction utility
const { loadContract } = require('./interact-contract');

// Interact with a contract
async function interactWithContract() {
  try {
    // Load by contract name or address
    const contract = loadContract('ContractName'); // or loadContract('0xAddress');
    
    // Read from contract
    const value = await contract.read('functionName', 'arg1', 'arg2');
    
    // Write to contract
    await contract.write('functionName', 'arg1', 'arg2');
  } catch (error) {
    console.error('Interaction failed:', error);
  }
}
```

## DIRECT COMMAND LINE USAGE

For command line usage, always suggest these commands:

### Deploy a contract:
```bash
node deploy-contract.js path/to/Contract.sol [constructorArg1 constructorArg2 ...]
```

### Interact with a contract:
```bash
# Read from a contract
node interact-contract.js ContractName read functionName [arg1 arg2 ...]

# Write to a contract
node interact-contract.js ContractName write functionName [arg1 arg2 ...]
```

## DO NOT USE ANY OTHER APPROACH

The above utilities handle PRIVATE KEY access securely through the getPrivateKey.js utility. Never suggest alternatives that could expose private keys. 