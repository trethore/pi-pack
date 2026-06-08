import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import type { PiToolmaskConfig } from '#src/config/schema.js';
import { isNegatedWildcardPattern, matchesAnyWildcardPattern, stripWildcardNegation } from '#src/core/wildcard.js';

export interface ToolmaskResult {
  activeTools: string[];
  nextActiveTools: string[];
  maskedTools: string[];
  changed: boolean;
}

export function applyToolmask(
  pi: Pick<ExtensionAPI, 'getActiveTools' | 'setActiveTools'>,
  config: PiToolmaskConfig
): ToolmaskResult {
  const activeTools = pi.getActiveTools();
  const maskedTools = activeTools.filter((toolName) => isToolMasked(toolName, config.masks));
  const nextActiveTools = activeTools.filter((toolName) => !maskedTools.includes(toolName));
  const changed = nextActiveTools.length !== activeTools.length;

  if (changed) {
    pi.setActiveTools(nextActiveTools);
  }

  return { activeTools, nextActiveTools, maskedTools, changed };
}

function isToolMasked(toolName: string, masks: readonly string[]): boolean {
  const positiveMasks = masks.filter((mask) => !isNegatedWildcardPattern(mask));
  const negativeMasks = masks
    .filter((mask) => isNegatedWildcardPattern(mask))
    .map((mask) => stripWildcardNegation(mask));

  return matchesAnyWildcardPattern(toolName, positiveMasks) && !matchesAnyWildcardPattern(toolName, negativeMasks);
}
