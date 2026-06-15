import { getConfigPaths as getSharedConfigPaths } from '@trethore/pi-shared/config/locations.js';

const CONFIG_FILE_NAME = 'pi-toolbox.jsonc';

export function getToolboxConfigPaths(cwd: string): string[] {
  return getSharedConfigPaths(cwd, CONFIG_FILE_NAME);
}
