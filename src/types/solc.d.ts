declare module 'solc' {
  function loadRemoteVersion(version: string, callback: (err: Error | null, solcSnapshot: any) => void): void;
  function compile(input: string): string;
} 