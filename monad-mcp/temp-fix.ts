// Simplified example of what we want to change in the file

// Before:
export const tools = {
    'deploy-contract': async function(params: {
        sourceCode: string,
        constructorArgs?: any[],
        contractName?: string,
        saveArtifacts?: boolean
    }) {
        try {
            const result = await deployContract(params);
            return result;
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
};

// After:
export const tools = {
    'deploy-contract': deployContract
}; 