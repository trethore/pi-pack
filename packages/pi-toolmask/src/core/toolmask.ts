import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import { createWildcardMatcher, isNegatedWildcardPattern, stripWildcardNegation } from '#src/core/wildcard.js';

export type Toolmask = (toolName: string) => boolean;

export interface ToolmaskResult {
  activeTools: string[];
  nextActiveTools: string[];
  maskedTools: string[];
  changed: boolean;
}

export function applyToolmask(
  pi: Pick<ExtensionAPI, 'getActiveTools' | 'setActiveTools'>,
  isToolMasked: Toolmask
): ToolmaskResult {
  const activeTools = pi.getActiveTools();
  const nextActiveTools: string[] = [];
  const maskedTools: string[] = [];

  for (const toolName of activeTools) {
    if (isToolMasked(toolName)) {
      maskedTools.push(toolName);
    } else {
      nextActiveTools.push(toolName);
    }
  }

  const changed = maskedTools.length > 0;

  if (changed) {
    pi.setActiveTools(nextActiveTools);
  }

  return { activeTools, nextActiveTools, maskedTools, changed };
}

export function compileToolmask(masks: readonly string[]): Toolmask {
  const positiveMasks: string[] = [];
  const negativeMasks: string[] = [];

  for (const mask of masks) {
    if (isNegatedWildcardPattern(mask)) {
      negativeMasks.push(stripWildcardNegation(mask));
    } else {
      positiveMasks.push(mask);
    }
  }

  const matchesPositiveMask = createWildcardMatcher(positiveMasks);
  const matchesNegativeMask = createWildcardMatcher(negativeMasks);

  return (toolName) => matchesPositiveMask(toolName) && !matchesNegativeMask(toolName);
}
