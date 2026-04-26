import { homedir } from 'node:os';
import path from 'node:path';

export function getConfigPaths(cwd: string): string[] {
  return [
    path.join(homedir(), '.pi', 'agent', 'pi-cut.jsonc'),
    path.join(cwd, '.pi', 'pi-cut.jsonc'),
  ];
}
