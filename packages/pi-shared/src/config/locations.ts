import path from 'node:path';

import { getAgentDir } from '@earendil-works/pi-coding-agent';

export function getGlobalConfigPath(configFileName: string): string {
  return path.join(getAgentDir(), configFileName);
}

export function getProjectConfigPath(cwd: string, configFileName: string): string {
  return path.join(cwd, '.pi', configFileName);
}

export function getConfigPaths(cwd: string, configFileName: string): string[] {
  return [getGlobalConfigPath(configFileName), getProjectConfigPath(cwd, configFileName)];
}
