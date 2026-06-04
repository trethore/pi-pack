import type { UnsafeContentTransformer } from '#src/unsafe/patch-state.js';
import { getUnsafePatchState } from '#src/unsafe/patch-state.js';
import { installAgentSessionPatch } from '#src/unsafe/agent-session-patch.js';
import { checkUnsafeCompatibility } from '#src/unsafe/compatibility.js';
import { installResourceLoaderPatch } from '#src/unsafe/resource-loader-patch.js';

export interface UnsafePatchInstallResult {
  installed: boolean;
  warnings: string[];
  errors: string[];
}

export function disableUnsafePiCommandTemplatePatch(): void {
  getUnsafePatchState().transformer = undefined;
}

export function installUnsafePiCommandTemplatePatch(
  transformer: UnsafeContentTransformer
): UnsafePatchInstallResult {
  const compatibility = checkUnsafeCompatibility();
  const warnings = [...compatibility.warnings];
  const errors = [...compatibility.errors];

  if (errors.length > 0) {
    return { installed: false, warnings, errors };
  }

  const state = getUnsafePatchState();
  state.transformer = transformer;

  try {
    warnings.push(...installResourceLoaderPatch(), ...installAgentSessionPatch());
  } catch (error) {
    errors.push(
      `pi-command-template: failed to install unsafe Pi internals patch: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return { installed: errors.length === 0, warnings, errors };
}
