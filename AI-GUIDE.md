# Guide for AI Assistants (like Claude) on Using the Contract Utilities

This document provides instructions for AI assistants on how to deploy and interact with smart contracts using the provided utilities.

## 1. Private Key Management

The private key is managed through the `getPrivateKey.js` utility, which loads it from `env.js`. AI assistants should use this utility rather than asking for the private key directly.

## 2. Deploying Contracts

To deploy a smart contract, use the `deploy-contract.js` utility. This automatically handles:
- Loading the private key from `env.js`
- Compiling the Solidity contract
- Deploying to the Monad testnet
- Saving contract artifacts for future interactions

### Example for AI Assistants:

```javascript
// To deploy a contract at examples/MyContract.sol with constructor arguments
const { deployContract } = require('./deploy-contract');

async function deployMyContract() {
  try {
    const result = await deployContract('examples/MyContract.sol', ['constructor arg 1', 'arg 2']);
    console.log(`Contract deployed at: ${result.address}`);
  } catch (error) {
    console.error('Deployment failed:', error);
  }
}

deployMyContract();
```

### Command Line Usage:

```bash
node deploy-contract.js <path-to-contract.sol> [constructorArg1 constructorArg2 ...]
```

### Simple NPM Script:

```bash
npm run deploy -- <path-to-contract.sol> [constructorArg1 constructorArg2 ...]
```

## 3. Interacting with Contracts

To interact with a deployed contract, use the `interact-contract.js` utility. This will:
- Load the private key from `env.js`
- Find the contract ABI from the artifacts directory
- Allow reading from and writing to the contract

### Example for AI Assistants:

```javascript
// To interact with a contract
const { loadContract } = require('./interact-contract');

async function interactWithContract() {
  try {
    // Load by address or name (from artifacts)
    const contract = loadContract('0xContractAddress'); 
    // Or: const contract = loadContract('MyContract');
    
    // Read from the contract
    const value = await contract.read('myReadFunction', 'arg1', 'arg2');
    console.log('Value:', value);
    
    // Write to the contract
    const tx = await contract.write('myWriteFunction', 'arg1', 'arg2');
    console.log('Transaction successful');
  } catch (error) {
    console.error('Interaction failed:', error);
  }
}

interactWithContract();
```

### Command Line Usage:

```bash
# To read from a contract
node interact-contract.js <contractAddressOrName> read <functionName> [arg1 arg2 ...]

# To write to a contract
node interact-contract.js <contractAddressOrName> write <functionName> [arg1 arg2 ...]
```

### Simple NPM Script:

```bash
# To read from a contract
npm run interact -- <contractAddressOrName> read <functionName> [arg1 arg2 ...]

# To write to a contract
npm run interact -- <contractAddressOrName> write <functionName> [arg1 arg2 ...]
```

## 4. Key Points for AI Assistants

1. **No Need to Ask for Private Key**: The utilities automatically load the private key from env.js.
2. **Contract Artifacts**: After deployment, contract artifacts (including ABI and address) are saved in the artifacts directory.
3. **Contract Naming**: The name of the contract is determined from the file name (without .sol extension).
4. **Error Handling**: All utilities include helpful error messages if something goes wrong.

## 5. Recently Deployed Contracts

- **MySimpleContract**: A simple contract with message storage and counter functionality
  - Contract Address: [check artifacts/MySimpleContract.json]
  - Functions:
    - `getMessage()`: Read the stored message
    - `setMessage(string)`: Set a new message (owner only)
    - `incrementCounter()`: Increment the counter
    - `counter()`: Read the current counter value
    - `owner()`: Get the contract owner 