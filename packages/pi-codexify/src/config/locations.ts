import { homedir } from 'node:os';
import path from 'node:path';

export function getConfigPaths(cwd: string): string[] {
  return [
    path.join(homedir(), '.pi', 'agent', 'codexify.jsonc'),
    path.join(cwd, '.pi', 'codexify.jsonc'),
  ];
}
