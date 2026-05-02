import { describe, expect, it } from 'vitest';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { defaultConfig, type PiCutConfig } from '#pi-cut/config/schema.js';
import { registerEfficiencyReminder } from '#pi-cut/features/efficiency-reminder/index.js';

const REMINDER = '<system_reminder>Keep output concise.</system_reminder>';

describe('registerEfficiencyReminder', () => {
  it('transforms submitted input once every configured prompt count', () => {
    const handlers = registerWithConfig({
      ...defaultConfig,
      efficiencyReminder: {
        enabled: true,
        onEvery: 2,
        text: REMINDER,
      },
    });

    const firstResult = runInput(handlers, 'first');
    const secondResult = runInput(handlers, 'second');

    expect(firstResult).toBeUndefined();
    expect(secondResult).toEqual({
      action: 'transform',
      text: `second\n\n${REMINDER}`,
      images: undefined,
    });
  });

  it('preserves images when transforming input', () => {
    const handlers = registerWithConfig({
      ...defaultConfig,
      efficiencyReminder: {
        enabled: true,
        onEvery: 1,
        text: REMINDER,
      },
    });
    const images = [{ type: 'image' as const, data: 'abc', mimeType: 'image/png' }];

    const result = runInput(handlers, 'prompt', images);

    expect(result).toEqual({
      action: 'transform',
      text: `prompt\n\n${REMINDER}`,
      images,
    });
  });

  it('does not transform input when the reminder is already present', () => {
    const handlers = registerWithConfig({
      ...defaultConfig,
      efficiencyReminder: {
        enabled: true,
        onEvery: 1,
        text: REMINDER,
      },
    });

    const result = runInput(handlers, `prompt\n\n${REMINDER}`);

    expect(result).toBeUndefined();
  });

  it('does not transform input when globally disabled', () => {
    const handlers = registerWithConfig({ ...defaultConfig, enabled: false });

    const result = runInput(handlers, 'prompt');

    expect(result).toBeUndefined();
  });
});

type Handler = (event: unknown) => unknown;
type RegisteredHandlers = Record<string, Handler[]>;
type TestImage = { type: 'image'; data: string; mimeType: string };

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

function runInput(handlers: RegisteredHandlers, text: string, images?: TestImage[]) {
  return handlers.input[0]({
    type: 'input',
    text,
    images,
    source: 'interactive',
  });
}
