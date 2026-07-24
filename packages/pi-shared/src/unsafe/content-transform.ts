import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { checkPiContentTransformCompatibility } from '@trethore/pi-shared/unsafe/content-transform/compatibility.js';
import { installResourceLoaderContentTransform } from '@trethore/pi-shared/unsafe/content-transform/resource-loader.js';
import { installSkillInvocationContentTransform } from '@trethore/pi-shared/unsafe/content-transform/skill-invocation.js';
import {
  getPiContentTransformState,
  type PiContentTransformInput,
  type PiContentTransformer,
} from '@trethore/pi-shared/unsafe/content-transform/state.js';

export type {
  PiContentSurface,
  PiContentTransformInput,
  PiContentTransformMetadata,
  PiContentTransformer,
} from '@trethore/pi-shared/unsafe/content-transform/state.js';

export interface PiContentTransformRegistrationResult {
  installed: boolean;
  warnings: string[];
  errors: string[];
}

export interface PiContentTransformerRegistration {
  id: string;
  transform: PiContentTransformer;
  onError?(error: unknown, input: PiContentTransformInput): void;
}

export function removePiContentTransformer(id: string): void {
  getPiContentTransformState().transformers.delete(id);
}

export function registerPiContentTransformer(
  pi: ExtensionAPI,
  registration: PiContentTransformerRegistration
): PiContentTransformRegistrationResult {
  const compatibility = checkPiContentTransformCompatibility();
  const warnings = [...compatibility.warnings];
  const errors = [...compatibility.errors];

  if (errors.length === 0) {
    try {
      warnings.push(...installResourceLoaderContentTransform(), ...installSkillInvocationContentTransform());
    } catch (error) {
      errors.push(
        `pi-shared: failed to install Pi content transforms: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  if (errors.length === 0) {
    getPiContentTransformState().transformers.set(registration.id, (input) => {
      try {
        return registration.transform(input);
      } catch (error) {
        try {
          registration.onError?.(error, input);
        } catch {
          return input.content;
        }
        return input.content;
      }
    });
  }

  pi.on('session_shutdown', (event) => {
    if (event.reason === 'reload') removePiContentTransformer(registration.id);
  });

  return { installed: errors.length === 0, warnings, errors };
}
