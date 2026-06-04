import { getConfigPaths as getSharedConfigPaths } from '@trethore/pi-shared/config/locations.js';

const CONFIG_FILE_NAME = 'pi-command-template.jsonc';

export function getConfigPaths(cwd: string): string[] {
  return getSharedConfigPaths(cwd, CONFIG_FILE_NAME);
}
