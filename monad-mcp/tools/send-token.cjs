const { ethers } = require('ethers');
const path = require('path');
const fs = require('fs');

// Import z schema for validation
const { z } = require("zod");

// Load private key from env.js
let PRIVATE_KEY;
try {
  const envFilePath = path.resolve(__dirname, '../../env.js');
  if (fs.existsSync(envFilePath)) {
    const envFile = require(envFilePath);
    PRIVATE_KEY = envFile.PRIVATE_KEY;
    
    // Mask key for security in logs
    const maskedKey = PRIVATE_KEY.substring(0, 6) + '...' + PRIVATE_KEY.substring(PRIVATE_KEY.length - 4);
    const address = new ethers.Wallet(PRIVATE_KEY).address;
    console.error(`[INFO] Loaded private key from env.js (address: ${address.substring(0, 6)}...${address.substring(address.length - 4)})`);
  } else {
    console.error('[ERROR] env.js file not found');
    throw new Error('Missing env.js file with PRIVATE_KEY');
  }
} catch (error) {
  console.error(`[ERROR] Failed to load private key: ${error.message}`);
  throw error;
}

// ERC20 ABI - only what we need for transfers
const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

/**
 * Send tokens to multiple recipients
 */
async function sendTokens(tokenAddress, recipients, amount) {
  try {
    console.error(`[INFO] Sending tokens from contract: ${tokenAddress}`);
    
    if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
      throw new Error(`Invalid token address: ${tokenAddress}`);
    }
    
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      throw new Error('Recipients must be a non-empty array of addresses');
    }
    
    // Validate each recipient address
    for (const recipient of recipients) {
      if (!ethers.isAddress(recipient)) {
        throw new Error(`Invalid recipient address: ${recipient}`);
      }
    }
    
    if (amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }
    
    // Set up provider and wallet
    const provider = new ethers.JsonRpcProvider('https://testnet-rpc.monad.xyz');
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    // Create contract instance
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    
    // Get token info for better logging
    try {
      const symbol = await tokenContract.symbol();
      const decimals = await tokenContract.decimals();
      const formattedAmount = ethers.formatUnits(amount, decimals);
      console.error(`[INFO] Sending ${formattedAmount} ${symbol} to ${recipients.length} recipients`);
    } catch (error) {
      console.error(`[WARN] Could not get token info: ${error.message}`);
    }
    
    // Send tokens to each recipient
    const results = [];
    for (const recipient of recipients) {
      try {
        console.error(`[INFO] Sending tokens to ${recipient}`);
        
        const tx = await tokenContract.transfer(recipient, amount);
        console.error(`[INFO] Transaction hash: ${tx.hash}`);
        
        // Wait for confirmation
        console.error('[INFO] Waiting for confirmation...');
        const receipt = await tx.wait();
        
        console.error(`[INFO] ✅ Transfer to ${recipient} confirmed in tx: ${receipt.hash}`);
        
        results.push({
          to: recipient,
          txHash: receipt.hash
        });
      } catch (error) {
        console.error(`[ERROR] Failed to send tokens to ${recipient}: ${error.message}`);
        results.push({
          to: recipient,
          error: error.message
        });
      }
    }
    
    // Check if any transfers succeeded
    const successful = results.filter(r => r.txHash);
    const failed = results.filter(r => r.error);
    
    if (successful.length === 0) {
      throw new Error('All transfers failed');
    }
    
    return {
      success: true,
      sent: results.filter(r => r.txHash),
      failed: failed.length > 0 ? failed : undefined
    };
  } catch (error) {
    console.error(`[ERROR] Token transfer error: ${error.message}`);
    throw error;
  }
}

// Export the tool
module.exports = {
  name: "send-token",
  description: "Send ERC20 tokens to multiple recipients on Monad testnet",
  parameters: {
    tokenAddress: z.string().describe("The ERC20 token contract address"),
    recipients: z.array(z.string()).describe("Array of wallet addresses to receive tokens"),
    amount: z.string().or(z.number()).describe("Amount of tokens to send to each recipient")
  },
  
  handler: async (input) => {
    console.error("[INFO] Received send-token request");
    
    try {
      // Validate input
      if (!input || !input.tokenAddress || !input.recipients || input.amount === undefined) {
        const errorResponse = {
          success: false,
          error: "Missing required parameters: tokenAddress, recipients, and amount"
        };
        
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify(errorResponse)
          }]
        };
      }
      
      // Convert amount to BigInt if it's a string (for handling large numbers)
      let amount = input.amount;
      if (typeof amount === 'string') {
        try {
          // If it's a string with scientific notation or decimal, parse it
          if (amount.includes('e') || amount.includes('.')) {
            amount = ethers.parseUnits(amount, 18); // Default to 18 decimals
          } else {
            amount = BigInt(amount);
          }
        } catch (error) {
          return {
            content: [{ 
              type: "text", 
              text: JSON.stringify({
                success: false,
                error: `Invalid amount format: ${error.message}`
              })
            }]
          };
        }
      }
      
      // Send the tokens
      const result = await sendTokens(input.tokenAddress, input.recipients, amount);
      
      // Return the result
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify(result)
        }]
      };
    } catch (error) {
      console.error(`[ERROR] Token transfer failed: ${error.message}`);
      
      const errorResponse = {
        success: false,
        error: `Token transfer failed: ${error.message}`
      };
      
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify(errorResponse)
        }]
      };
    }
  }
}; 