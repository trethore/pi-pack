import {
  getConfigPaths as getSharedConfigPaths,
  getGlobalConfigPath,
  getProjectConfigPath,
} from '@trethore/pi-shared/config/locations.js';

const CONFIG_FILE_NAME = 'pi-codexify.jsonc';

export const GLOBAL_CONFIG_PATH = getGlobalConfigPath(CONFIG_FILE_NAME);
export const PROJECT_CONFIG_PATH = getProjectConfigPath(process.cwd(), CONFIG_FILE_NAME);

export function getCodexifyConfigPaths(cwd: string): string[] {
  return getSharedConfigPaths(cwd, CONFIG_FILE_NAME);
}
