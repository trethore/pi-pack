import path from 'node:path';
import { getAgentDir } from '@earendil-works/pi-coding-agent';

const SCRIPT_TEMPLATES_DIRECTORY = 'script-templates';

export function getGlobalScriptTemplatesDirectory(): string {
  return path.join(getAgentDir(), SCRIPT_TEMPLATES_DIRECTORY);
}

export function getProjectScriptTemplatesDirectory(cwd: string): string {
  return path.join(cwd, '.pi', SCRIPT_TEMPLATES_DIRECTORY);
}
