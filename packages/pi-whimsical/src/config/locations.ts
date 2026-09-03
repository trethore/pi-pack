import { getConfigPaths as getSharedConfigPaths } from '@trethore/shared/config/locations.js';

const CONFIG_FILE_NAME = 'pi-whimsical.jsonc';

export function getWhimsicalConfigPaths(cwd: string): string[] {
  return getSharedConfigPaths(cwd, CONFIG_FILE_NAME);
}
