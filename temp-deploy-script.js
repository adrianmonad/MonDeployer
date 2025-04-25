
// Temporary deployment script - will be deleted after use
const fs = require('fs');
const path = require('path');
const solc = require('solc');
const { createPublicClient, createWalletClient, http } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const os = require('os');

// Get private key from env.js - absolute path to ensure it works regardless of working directory
const envJsPath = path.resolve('/Users/adrianmesina/Desktop/DropFlow', 'env.js');
console.log('Looking for env.js at:', envJsPath);

// Load the PRIVATE_KEY from env.js
const { PRIVATE_KEY } = require(envJsPath);

// Contract details
const CONTRACT_SOURCE = `// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

contract SimpleStorage {
    uint256 private storedData;
    
    event DataStored(address indexed user, uint256 value);
    
    function set(uint256 x) public {
        storedData = x;
        emit DataStored(msg.sender, x);
    }
    
    function get() public view returns (uint256) {
        return storedData;
    }
}
`;
const CONTRACT_NAME = 'SimpleStorage';
const CONSTRUCTOR_ARGS = [];
const SAVE_ARTIFACTS = true;

// Monad testnet configuration
const MONAD_RPC_URL = 'https://testnet-rpc.monad.xyz';
const MONAD_CHAIN_ID = 10143;

async function compileSolidity(source, contractName) {
    console.log('Compiling contract...');
    
    // Use Solidity compiler version 0.8.28 as specified
    const solidityVersion = '0.8.28';
    
    // Create compiler input
    const input = {
        language: 'Solidity',
        sources: {
            [`${contractName}.sol`]: { content: source }
        },
        settings: {
            outputSelection: {
                '*': { '*': ['abi', 'evm.bytecode.object'] }
            },
            optimizer: { enabled: true, runs: 200 }
        }
    };

    try {
        // Use a specific compiler version as requested
        return new Promise((resolve, reject) => {
            solc.loadRemoteVersion('v' + solidityVersion, (err, solcSnapshot) => {
                if (err) {
                    return reject({
                        success: false,
                        error: `Failed to load Solidity compiler v${solidityVersion}: ${err.message}`
                    });
                }
                
                try {
                    // Compile the source code
                    const output = JSON.parse(solcSnapshot.compile(JSON.stringify(input)));
                    
                    // Check for errors
                    if (output.errors) {
                        const errors = output.errors.filter(error => error.severity === 'error');
                        if (errors.length > 0) {
                            const errorMessage = errors.map(e => e.formattedMessage).join('\n');
                            return reject({
                                success: false,
                                error: `Compilation errors:\n${errorMessage}`
                            });
                        }
                    }
                    
                    // Get the compiled contract
                    const compiledContract = output.contracts[`${contractName}.sol`][contractName];
                    if (!compiledContract) {
                        return reject({
                            success: false,
                            error: `Contract ${contractName} not found in compiled output`
                        });
                    }
                    
                    resolve({
                        success: true,
                        abi: compiledContract.abi,
                        bytecode: `0x${compiledContract.evm.bytecode.object}`
                    });
                } catch (compileError) {
                    reject({
                        success: false,
                        error: `Compilation error: ${compileError.message}`
                    });
                }
            });
        });
    } catch (compileError) {
        return {
            success: false,
            error: `Compilation error: ${compileError.message}`
        };
    }
}

async function deployContract() {
    try {
        // Validate private key
        if (!PRIVATE_KEY) {
            console.error('PRIVATE_KEY not found in env.js');
            return console.log(JSON.stringify({
                success: false,
                error: 'PRIVATE_KEY not found in env.js'
            }));
        }
        
        console.log(`Deploying ${CONTRACT_NAME} to Monad testnet...`);
        
        // First compile the contract
        let compileResult;
        try {
            compileResult = await compileSolidity(CONTRACT_SOURCE, CONTRACT_NAME);
            if (!compileResult.success) {
                return console.log(JSON.stringify(compileResult));
            }
        } catch (error) {
            if (typeof error === 'object' && error !== null && 'success' in error) {
                return console.log(JSON.stringify(error));
            }
            return console.log(JSON.stringify({
                success: false,
                error: `Compilation failed: ${error.message || String(error)}`
            }));
        }
        
        const { abi, bytecode } = compileResult;
        
        // Create an account from the private key
        const privateKey = PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`;
        const account = privateKeyToAccount(privateKey);
        
        console.log(`Deploying from address: ${account.address}`);
        
        // Define the Monad testnet chain
        const monadTestnet = {
            id: MONAD_CHAIN_ID,
            name: 'Monad Testnet',
            network: 'monad-testnet',
            nativeCurrency: {
                name: 'MON',
                symbol: 'MON',
                decimals: 18
            },
            rpcUrls: {
                default: {
                    http: [MONAD_RPC_URL],
                },
                public: {
                    http: [MONAD_RPC_URL],
                }
            }
        };
        
        // Create clients
        const publicClient = createPublicClient({
            chain: monadTestnet,
            transport: http(MONAD_RPC_URL)
        });
        
        const walletClient = createWalletClient({
            account,
            chain: monadTestnet,
            transport: http(MONAD_RPC_URL)
        });
        
        // Deploy the contract
        console.log('Sending transaction...');
        let hash;
        try {
            hash = await walletClient.deployContract({
                abi,
                bytecode,
                args: CONSTRUCTOR_ARGS,
            });
        } catch (error) {
            return console.log(JSON.stringify({
                success: false,
                error: `Transaction failed: ${error.message || String(error)}`
            }));
        }
        
        console.log(`Transaction hash: ${hash}`);
        
        // Wait for transaction receipt
        console.log('Waiting for transaction confirmation...');
        let receipt;
        try {
            receipt = await publicClient.waitForTransactionReceipt({ hash });
        } catch (error) {
            return console.log(JSON.stringify({
                success: false,
                error: `Failed to get transaction receipt: ${error.message || String(error)}`,
                transactionHash: hash
            }));
        }
        
        if (!receipt.contractAddress) {
            return console.log(JSON.stringify({
                success: false,
                error: 'Contract deployment failed - no contract address in receipt',
                transactionHash: hash
            }));
        }
        
        console.log('✅ Contract deployed successfully!');
        console.log(`📝 Contract Address: ${receipt.contractAddress}`);
        console.log(`🔗 Transaction Hash: ${hash}`);
        console.log(`🌐 Explorer URL: https://explorer.testnet.monad.xyz/tx/${hash}`);
        
        // Save artifacts if requested
        let artifactPath;
        if (SAVE_ARTIFACTS) {
            const tempDir = os.tmpdir();
            const artifactsDir = path.join(tempDir, 'monad-deployments');
            
            if (!fs.existsSync(artifactsDir)) {
                fs.mkdirSync(artifactsDir, { recursive: true });
            }
            
            artifactPath = path.join(artifactsDir, `${CONTRACT_NAME}.json`);
            
            // Save ABI and address to file
            fs.writeFileSync(artifactPath, JSON.stringify({
                contractName: CONTRACT_NAME,
                address: receipt.contractAddress,
                abi,
                transactionHash: hash,
                network: 'monad-testnet',
                chainId: MONAD_CHAIN_ID,
                explorerUrl: `https://explorer.testnet.monad.xyz/tx/${hash}`
            }, null, 2));
            
            console.log(`💾 Contract artifacts saved to: ${artifactPath}`);
        }
        
        // Return deployment information
        const result = {
            success: true,
            address: receipt.contractAddress,
            transactionHash: hash,
            chainId: MONAD_CHAIN_ID,
            contractName: CONTRACT_NAME,
            explorerUrl: `https://explorer.testnet.monad.xyz/tx/${hash}`
        };
        
        if (SAVE_ARTIFACTS) {
            result.artifactPath = artifactPath;
        }
        
        // Only output valid JSON for the parent process to parse
        console.log(JSON.stringify(result));
        
        // Clean up after ourselves
        setTimeout(() => {
            try {
                fs.unlinkSync(__filename);
                console.log('Cleaned up temporary deployment script');
            } catch (err) {
                // Ignore errors in cleanup
            }
        }, 1000);
    } catch (error) {
        console.error('Deployment failed:', error.message);
        console.log(JSON.stringify({ 
            success: false,
            error: error instanceof Error ? error.message : String(error)
        }));
    }
}

// Run the deployment
deployContract();
