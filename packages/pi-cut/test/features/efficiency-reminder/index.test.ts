import { describe, expect, it } from 'vitest';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { defaultConfig, type PiCutConfig } from '#pi-cut/config/schema.js';
import { registerEfficiencyReminder } from '#pi-cut/features/efficiency-reminder/index.js';

describe('registerEfficiencyReminder', () => {
  it('applies the reminder once every configured prompt count', () => {
    // Arrange
    const handlers = registerWithConfig({
      ...defaultConfig,
      efficiencyReminder: {
        enabled: true,
        onEvery: 2,
        text: '<system_reminder>Keep output concise.</system_reminder>',
      },
    });

    // Act
    runBeforeAgentStart(handlers);
    const firstResult = runContext(handlers, 'first');
    runBeforeAgentStart(handlers);
    const secondResult = runContext(handlers, 'second');

    // Assert
    expect(firstResult).toBeUndefined();
    expect(secondResult).toMatchObject({
      messages: [
        {
          role: 'user',
          content: 'second\n\n<system_reminder>Keep output concise.</system_reminder>',
        },
      ],
    });
  });

  it('does not apply the reminder when globally disabled', () => {
    // Arrange
    const handlers = registerWithConfig({ ...defaultConfig, enabled: false });

    // Act
    runBeforeAgentStart(handlers);
    const result = runContext(handlers, 'prompt');

    // Assert
    expect(result).toBeUndefined();
  });
});

type Handler = (event: unknown) => unknown;
type RegisteredHandlers = Record<string, Handler[]>;

function registerWithConfig(config: PiCutConfig): RegisteredHandlers {
  const handlers: RegisteredHandlers = {};
  const pi = {
    on(event: string, handler: Handler) {
      handlers[event] = [...(handlers[event] ?? []), handler];
    },
  } as unknown as ExtensionAPI;

  registerEfficiencyReminder(pi, config);
  return handlers;
}

function runBeforeAgentStart(handlers: RegisteredHandlers) {
  handlers.before_agent_start[0]({});
}

function runContext(handlers: RegisteredHandlers, content: string) {
  return handlers.context[0]({
    type: 'context',
    messages: [{ role: 'user', content, timestamp: 1 }],
  });
}
