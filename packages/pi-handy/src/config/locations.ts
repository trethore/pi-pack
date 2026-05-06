import { homedir } from 'node:os';
import path from 'node:path';

const GLOBAL_CONFIG_PATH = path.join(homedir(), '.pi', 'agent', 'pi-handy.jsonc');
export function getConfigPaths(cwd: string): string[] {
  const projectConfigPath = path.join(cwd, '.pi', 'pi-handy.jsonc');
  return [GLOBAL_CONFIG_PATH, projectConfigPath];
}
