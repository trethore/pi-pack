import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';
import { registerCommandTemplateDiagnostics } from '#src/command-template/diagnostics.js';
import type { CommandDiagnostic } from '#src/core/diagnostics.js';

interface RegisteredHandler {
  event: string;
  handler: (event: unknown, context: FakeContext) => void;
}

interface FakeContext {
  ui: {
    notify(message: string, severity: 'warning' | 'error'): void;
  };
}

function createFakePi() {
  const handlers: RegisteredHandler[] = [];
  return {
    handlers,
    pi: {
      on: (event: string, handler: RegisteredHandler['handler']) => {
        handlers.push({ event, handler });
      },
    },
  };
}

function createFakeContext(messages: Array<{ message: string; severity: 'warning' | 'error' }>) {
  return {
    ui: {
      notify: (message, severity) => messages.push({ message, severity }),
    },
  } satisfies FakeContext;
}

describe('registerCommandTemplateDiagnostics', () => {
  it('deduplicates startup diagnostics and reports late diagnostics', () => {
    // Arrange
    const diagnostics: CommandDiagnostic[] = [{ severity: 'warning', message: 'startup warning' }];
    const messages: Array<{ message: string; severity: 'warning' | 'error' }> = [];
    const { handlers, pi } = createFakePi();
    const reporter = registerCommandTemplateDiagnostics(pi as unknown as ExtensionAPI, () => diagnostics);
    const context = createFakeContext(messages);

    // Act
    handlers[0]?.handler({}, context);
    handlers[1]?.handler({}, context);
    reporter.reportDiagnostic({
      severity: 'warning',
      message: 'late warning',
      surface: 'contextFiles',
      path: 'AGENTS.md',
    });

    // Assert
    expect(messages).toEqual([
      { message: 'startup warning', severity: 'warning' },
      { message: 'late warning (contextFiles: AGENTS.md)', severity: 'warning' },
    ]);
  });

  it('does not mark diagnostics as reported before a context is available', () => {
    // Arrange
    const diagnostics: CommandDiagnostic[] = [];
    const messages: Array<{ message: string; severity: 'warning' | 'error' }> = [];
    const { handlers, pi } = createFakePi();
    const reporter = registerCommandTemplateDiagnostics(pi as unknown as ExtensionAPI, () => diagnostics);
    const earlyDiagnostic: CommandDiagnostic = { severity: 'warning', message: 'early warning' };

    diagnostics.push(earlyDiagnostic);

    // Act
    reporter.reportDiagnostic(earlyDiagnostic);
    handlers[0]?.handler({}, createFakeContext(messages));

    // Assert
    expect(messages).toEqual([{ message: 'early warning', severity: 'warning' }]);
  });
});
