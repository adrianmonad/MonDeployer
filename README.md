# MonDeployer - Monad Contract Deployment Tool

This repository provides tools for compiling and deploying Solidity contracts to the Monad testnet.

## ⚠️ IMPORTANT REQUIREMENT ⚠️

When deploying contracts to Monad, **you must use Solidity version 0.8.28** exactly. This is a requirement for compatibility with the Monad EVM. Using any other version will result in errors.

## Getting Started

1. Create an `env.js` file in the root directory with your private key:
   ```javascript
   // env.js
   exports.PRIVATE_KEY = "your_private_key_here"; //
   ```

2. Use the SimpleStorage example as a template for your contracts:
   ```solidity
   // SPDX-License-Identifier: MIT
   pragma solidity 0.8.28;  // Always use this exact version
   
   contract YourContract {
       // Your contract code
   }
   ```

## 🔧 Solution to JSON Parsing Errors

If you see errors like:
```
MCP monad-mcp: Unexpected token 'L', "Looking fo"... is not valid JSON
MCP monad-mcp: Unexpected token 'D', "Deploying "... is not valid JSON
MCP monad-mcp: Unexpected token 'M', "Monad MCP "... is not valid JSON
```

We have multiple solutions for you:

### 1. Ultra-Simple Mock MCP Plugin (Most Reliable)

For fastest debugging, use our ultra-simple MCP plugin that always returns a mock success:

```bash
npm run start-simple-mcp
```

This plugin ignores your contract and always returns a successful deployment response.

Configure Claude Desktop to use it:
```json
{
  "mcpServers": {
    "monad-mcp": {
      "command": "node",
      "args": [
        "/path/to/DropFlow/monad-mcp/simple-mcp-plugin.js"
      ]
    }
  }
}
```

### 2. Strict MCP Plugin (Auto-Fixes Solidity Version)

For actual contract deployment with version auto-fixing:

```bash
npm run start-strict-mcp
```

This plugin automatically fixes ANY Solidity version to 0.8.28 and redirects all non-JSON output to stderr.

Configure Claude Desktop with:
```json
{
  "mcpServers": {
    "monad-mcp": {
      "command": "node",
      "args": [
        "/path/to/DropFlow/monad-mcp/strict-mcp-plugin.js"
      ]
    }
  }
}
```

## 🚀 Fastest Option: Just Deploy a Simple Contract

Skip Claude entirely and deploy a simple storage contract directly:

```bash
npm run simple-deploy
```

This deploys a pre-configured SimpleStorage contract using Solidity 0.8.28.

## Example Deployments

The repository includes several examples:

```bash
# Deploy the SimpleStorage contract (simplest)
npm run deploy-storage

# Deploy the SimpleToken contract
npm run deploy-token

# Alternative clean deployment script with better error handling
npm run deploy-token-clean
```

## Custom Contract Deployment

To deploy a custom contract:

1. Create your contract file with `pragma solidity 0.8.28`
2. Use the deployment utility in your script:

```javascript
const { compileAndDeploy } = require('./src/utils/contract-deployer');
const fs = require('fs');
const { PRIVATE_KEY } = require('./env.js');

const contractSource = fs.readFileSync('path/to/your/contract.sol', 'utf8');

async function deploy() {
  const result = await compileAndDeploy(
    contractSource,
    PRIVATE_KEY,
    [/* constructor arguments */],
    {
      solcVersion: '0.8.28',  // Always specify this version
      saveArtifacts: true
    }
  );
  
  console.log(`Contract deployed at: ${result.address}`);
}

deploy();
```

## Troubleshooting

If you encounter JSON parsing errors like:

```
MCP monad-mcp: Unexpected token 'S', "Starting c"... is not valid JSON
```

Try these solutions in order:
1. Use the ultra-simple MCP plugin: `npm run start-simple-mcp` (always succeeds with mock data)
2. Use the strict MCP plugin: `npm run start-strict-mcp` (fixes version issues automatically)
3. Check your contract's pragma version: `npm run check-solidity examples/YourContract.sol`
4. Use the clean deployment script: `npm run deploy-token-clean`
5. Fix your contract's Solidity version: `npm run fix-solidity YourContract.sol`
6. Deploy directly without Claude: `npm run simple-deploy`

Always check your contract's pragma version first:
```solidity
pragma solidity 0.8.28;  // Must be exact version, not ^0.8.0 or similar
```

## Template Contract

A template contract is available at `monad-mcp/solidity-template.sol` that you can use as a starting point for any new contracts.

## Security Note

Always keep your `env.js` file secure and never commit it to version control. The private key is never hardcoded, printed, or exposed in logs or code.

# MonDeployer
