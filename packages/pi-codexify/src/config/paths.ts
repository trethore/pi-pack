import path from 'node:path';

import { CONFIG_DIR_NAME } from '@earendil-works/pi-coding-agent';
import { getGlobalConfigPath } from '@trethore/pi-shared/config/locations.js';

const CONFIG_FILE_NAME = 'pi-codexify.jsonc';

export const GLOBAL_CONFIG_PATH = getGlobalConfigPath(CONFIG_FILE_NAME);

export function getProjectConfigPath(cwd: string): string {
  return path.join(cwd, CONFIG_DIR_NAME, CONFIG_FILE_NAME);
}

export function getConfigPaths(cwd: string, includeProject = true): string[] {
  return includeProject ? [GLOBAL_CONFIG_PATH, getProjectConfigPath(cwd)] : [GLOBAL_CONFIG_PATH];
}
