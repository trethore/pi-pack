import { createRequire } from 'node:module';

interface RipgrepPackage {
  rgPath: string;
}

const require = createRequire(import.meta.url);
let cachedRipgrepExecutable: string | undefined;

export function getRipgrepExecutable(): string {
  cachedRipgrepExecutable ??= resolveRipgrepExecutable();
  return cachedRipgrepExecutable;
}

function resolveRipgrepExecutable(): string {
  try {
    return (require('@vscode/ripgrep') as RipgrepPackage).rgPath;
  } catch {
    return 'rg';
  }
}
