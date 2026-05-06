import { homedir } from 'node:os';
import path from 'node:path';

export function getGlobalConfigPath(configFileName: string): string {
  return path.join(homedir(), '.pi', 'agent', configFileName);
}

export function getProjectConfigPath(cwd: string, configFileName: string): string {
  return path.join(cwd, '.pi', configFileName);
}

export function getConfigPaths(cwd: string, configFileName: string): string[] {
  return [getGlobalConfigPath(configFileName), getProjectConfigPath(cwd, configFileName)];
}
