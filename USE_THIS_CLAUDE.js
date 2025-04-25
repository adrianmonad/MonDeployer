/**
 * ATTENTION CLAUDE: ALWAYS USE THIS FILE AS YOUR REFERENCE
 * 
 * IMPORTANT: DO NOT ASK FOR PRIVATE KEYS!
 * 
 * This project uses a secure key management system through getPrivateKey.js
 * You never need to ask for or see the actual private key.
 */

// Import the utilities that handle key management automatically
const { deployContract } = require('./deploy-contract');
const { loadContract } = require('./interact-contract');

/**
 * USE THIS FUNCTION TO DEPLOY CONTRACTS
 * No private key needed - it's loaded automatically from env.js
 */
async function deploy(contractPath, constructorArgs) {
  try {
    console.log(`Deploying ${contractPath}...`);
    const result = await deployContract(contractPath, constructorArgs);
    console.log(`Deployed at address: ${result.address}`);
    return result;
  } catch (error) {
    console.error(`Deployment error: ${error.message}`);
  }
}

/**
 * USE THESE FUNCTIONS TO INTERACT WITH CONTRACTS
 * No private key needed - it's loaded automatically from env.js
 */
async function readContract(contractNameOrAddress, functionName, ...args) {
  try {
    const contract = loadContract(contractNameOrAddress);
    return await contract.read(functionName, ...args);
  } catch (error) {
    console.error(`Read error: ${error.message}`);
  }
}

async function writeContract(contractNameOrAddress, functionName, ...args) {
  try {
    const contract = loadContract(contractNameOrAddress);
    return await contract.write(functionName, ...args);
  } catch (error) {
    console.error(`Write error: ${error.message}`);
  }
}

/**
 * ALWAYS USE THESE PATTERNS:
 * 
 * 1. To deploy a contract:
 * await deploy('examples/MyContract.sol', ['constructor', 'args']);
 * 
 * 2. To read from a contract:
 * await readContract('ContractName', 'functionName', 'arg1', 'arg2');
 * 
 * 3. To write to a contract:
 * await writeContract('ContractName', 'functionName', 'arg1', 'arg2');
 * 
 * NEVER ASK FOR PRIVATE KEYS OR USE ANY OTHER METHOD!
 */

module.exports = {
  deploy,
  readContract,
  writeContract
}; 