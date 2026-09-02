import { getConfigPaths as getSharedConfigPaths } from '@trethore/shared/config/locations.js';

const CONFIG_FILE_NAME = 'pi-notify.jsonc';

export function getNotifyConfigPaths(cwd: string, includeProject = true): string[] {
  return getSharedConfigPaths(cwd, CONFIG_FILE_NAME, includeProject);
}
