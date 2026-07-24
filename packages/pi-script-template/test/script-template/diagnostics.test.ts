import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';
import type { ScriptTemplateDiagnostic } from '#src/core/diagnostics.js';
import { registerScriptTemplateDiagnostics } from '#src/script-template/diagnostics.js';

describe('registerScriptTemplateDiagnostics', () => {
  it('deduplicates diagnostics and reports late diagnostics', () => {
    // Arrange
    const diagnostics: ScriptTemplateDiagnostic[] = [{ severity: 'warning', message: 'startup warning' }];
    const messages: string[] = [];
    const handlers: Array<(event: unknown, context: unknown) => void> = [];
    const pi = {
      on: (_event: string, handler: (event: unknown, context: unknown) => void) => handlers.push(handler),
    } as unknown as ExtensionAPI;
    const reporter = registerScriptTemplateDiagnostics(pi, () => diagnostics);
    const context = { ui: { notify: (message: string) => messages.push(message) } };

    // Act
    handlers[0]?.({}, context);
    handlers[1]?.({}, context);
    reporter.reportDiagnostic({ severity: 'warning', message: 'late warning' });

    // Assert
    expect(messages).toEqual(['startup warning', 'late warning']);
  });
});
