import { getGlobalConfigPath, getProjectConfigPath } from '@trethore/pi-shared/config/locations.js';

const CONFIG_FILE_NAME = 'pi-script-template.jsonc';

export function getScriptTemplateConfigPaths(cwd: string, options: { includeProject?: boolean } = {}): string[] {
  const paths = [getGlobalConfigPath(CONFIG_FILE_NAME)];
  if (options.includeProject !== false) paths.push(getProjectConfigPath(cwd, CONFIG_FILE_NAME));
  return paths;
}
