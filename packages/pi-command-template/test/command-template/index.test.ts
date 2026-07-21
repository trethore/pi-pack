import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';
import { getExtensionCwd, registerCommandTemplate } from '#src/command-template/index.js';
import { defaultConfig } from '#src/config/schema.js';
import { getUnsafePatchState } from '#src/unsafe/patch-state.js';

describe('registerCommandTemplate', () => {
  it('removes its process-wide transformer before extension reload', () => {
    // Arrange
    const handlers = new Map<string, (event: { reason: string }, context: unknown) => void>();
    const pi = {
      on: (event: string, handler: (event: { reason: string }, context: unknown) => void) => {
        handlers.set(event, handler);
      },
    };

    registerCommandTemplate(pi as unknown as ExtensionAPI, defaultConfig);
    const extensionId = getExtensionCwd();
    const wasRegisteredBeforeReload = getUnsafePatchState().transformers.has(extensionId);

    // Act
    handlers.get('session_shutdown')?.({ reason: 'reload' }, {});

    // Assert
    expect(wasRegisteredBeforeReload).toBe(true);
    expect(getUnsafePatchState().transformers.has(extensionId)).toBe(false);
  });
});
