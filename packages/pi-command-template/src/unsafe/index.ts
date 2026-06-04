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

export function disableUnsafePiCommandTemplatePatch(id: string): void {
  const state = getUnsafePatchState();
  state.transformers.delete('legacy');
  state.transformers.delete(id);
}

export function installUnsafePiCommandTemplatePatch(
  id: string,
  transformer: UnsafeContentTransformer
): UnsafePatchInstallResult {
  const compatibility = checkUnsafeCompatibility();
  const warnings = [...compatibility.warnings];
  const errors = [...compatibility.errors];

  if (errors.length > 0) {
    return { installed: false, warnings, errors };
  }

  try {
    warnings.push(...installResourceLoaderPatch(), ...installAgentSessionPatch());
  } catch (error) {
    errors.push(
      `pi-command-template: failed to install unsafe Pi internals patch: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (errors.length === 0) {
    const state = getUnsafePatchState();
    state.transformers.delete('legacy');
    state.transformers.set(id, transformer);
  }

  return { installed: errors.length === 0, warnings, errors };
}
