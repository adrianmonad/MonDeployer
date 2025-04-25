# Important: Solidity Version Guide for Monad Deployments

## ALWAYS USE SOLIDITY VERSION 0.8.28 EXACTLY

When deploying contracts to the Monad blockchain, you **MUST** use Solidity version 0.8.28 exactly. This is a strict requirement due to the specific EVM compatibility of the Monad network.

## Common Issues

Using any other version, even similar ones like 0.8.19 or ^0.8.0, will cause deployment errors such as:

```
MCP monad-mcp: Unexpected token 'S', "Starting c"... is not valid JSON
MCP monad-mcp: Unexpected token 'E', "Executing "... is not valid JSON
MCP monad-mcp: Unexpected token 'C', "Compiling "... is not valid JSON
```

## How to Specify the Correct Version

In your Solidity contract, always use:

```solidity
pragma solidity 0.8.28;  // CORRECT - use this exact version
```

Do NOT use any of the following:

```solidity
pragma solidity ^0.8.0;        // WRONG - caret operator allows multiple versions
pragma solidity >=0.8.0 <0.9.0; // WRONG - version range not allowed
pragma solidity 0.8.19;        // WRONG - specific version but not 0.8.28
```

## Verifying Your Contract Version

Before deployment, verify your contract uses the correct Solidity version:

```bash
npm run check-solidity examples/YourContract.sol
```

## Creating New Contracts

When creating a new contract, start with one of our templates:

1. Simple contract template: `examples/YourContract.sol`
2. Token contract template: `examples/SimpleToken.sol`
3. Base template: `monad-mcp/solidity-template.sol`

All these templates already have the correct Solidity version specified.

## Deployment Process

1. Ensure your contract uses `pragma solidity 0.8.28;`
2. Use our deployment scripts that enforce the correct version:
   ```bash
   npm run deploy-token   # To deploy SimpleToken
   npm run check-and-deploy  # To check version and deploy
   ```

## Technical Details

The Monad EVM is optimized for Solidity 0.8.28 specifically. Using other versions may:

1. Result in bytecode incompatibility
2. Cause unexpected runtime errors
3. Lead to security vulnerabilities due to EVM differences

## Contact

If you encounter persistent issues with contract deployments, please contact the Monad team for assistance.

Remember: **ALWAYS use Solidity version 0.8.28 exactly for all Monad contract deployments.** 