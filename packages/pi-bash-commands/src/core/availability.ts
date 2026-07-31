import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

export function isBuiltInBashAvailable(pi: Pick<ExtensionAPI, 'getActiveTools' | 'getAllTools'>): boolean {
  if (!pi.getActiveTools().includes('bash')) return false;

  const bashTool = pi.getAllTools().find((tool) => tool.name === 'bash');
  return bashTool?.sourceInfo.source === 'builtin';
}
