import { homedir } from 'node:os';
import path from 'node:path';

export const GLOBAL_CONFIG_PATH = path.join(homedir(), '.pi', 'agent', 'pi-codexify.jsonc');
export const PROJECT_CONFIG_PATH = path.join(process.cwd(), '.pi', 'pi-codexify.jsonc');

export function getConfigPaths(cwd: string): string[] {
  return [GLOBAL_CONFIG_PATH, path.join(cwd, '.pi', 'pi-codexify.jsonc')];
}
