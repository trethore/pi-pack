import { getConfigPaths as getSharedConfigPaths } from '@trethore/pi-shared/config/locations.js';

const CONFIG_FILE_NAME = 'pi-codeact.jsonc';

export function getCodeactConfigPaths(cwd: string): string[] {
  return getSharedConfigPaths(cwd, CONFIG_FILE_NAME);
}
