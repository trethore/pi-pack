import path from 'node:path';
import { getAgentDir } from '@earendil-works/pi-coding-agent';
import { getProjectConfigPath } from '@trethore/pi-shared/config/locations.js';

const CONFIG_FILE_NAME = 'pi-handy.jsonc';

export function getHandyConfigPaths(cwd: string): string[] {
  return [path.join(getAgentDir(), CONFIG_FILE_NAME), getProjectConfigPath(cwd, CONFIG_FILE_NAME)];
}
