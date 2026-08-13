import { getConfigPaths } from '@trethore/shared/config/locations.js';

const CONFIG_FILE_NAME = 'pi-bash-commands.jsonc';

export function getBashCommandsConfigPaths(cwd: string, includeProject = true): string[] {
  return getConfigPaths(cwd, CONFIG_FILE_NAME, includeProject);
}
