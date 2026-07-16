import path from 'node:path';

import { CONFIG_DIR_NAME, getAgentDir } from '@earendil-works/pi-coding-agent';

const CONFIG_FILE_NAME = 'pi-cut.jsonc';

export function getCutConfigPaths(cwd: string, includeProject = true): string[] {
  const globalConfigPath = path.join(getAgentDir(), CONFIG_FILE_NAME);
  if (!includeProject) return [globalConfigPath];

  return [globalConfigPath, path.join(cwd, CONFIG_DIR_NAME, CONFIG_FILE_NAME)];
}
