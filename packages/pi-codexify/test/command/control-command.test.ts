import { beforeEach, describe, expect, it, vi } from 'vitest';

const configUpdate = vi.hoisted(() => ({
  resolveScope: vi.fn(),
  update: vi.fn(),
  buildMessage: vi.fn(),
}));

vi.mock('#pi-codexify/config/update.js', () => ({
  resolveConfigScope: configUpdate.resolveScope,
  updateControlConfig: configUpdate.update,
  buildConfigUpdateMessage: configUpdate.buildMessage,
}));

import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';

import { handleControlCommand } from '#pi-codexify/command/control-command.js';
import { defaultConfig, type PiCodexifyConfig } from '#pi-codexify/config/types.js';

describe('handleControlCommand', () => {
  beforeEach(() => {
    configUpdate.resolveScope.mockReset().mockReturnValue('global');
    configUpdate.update.mockReset().mockImplementation(async () => {});
    configUpdate.buildMessage.mockReset().mockImplementation((label, value, scope) => `${label}:${value}:${scope}`);
  });

  it('warns when controls are disabled', async () => {
    const config = createConfig();
    config.controls.enabled = false;
    const context = createContext();

    await handleControlCommand('verbosity', 'high', context, config);

    expect(context.ui.notify).toHaveBeenCalledWith('codexify controls are disabled in pi-codexify.jsonc.', 'warning');
    expect(configUpdate.update).not.toHaveBeenCalled();
  });

  it.each(['verbosity', 'reasoning-summary', 'service-tier'] as const)(
    'shows %s status without a value',
    async (command) => {
      const config = createConfig();
      const context = createContext();

      await handleControlCommand(command, undefined, context, config);

      expect(context.ui.notify).toHaveBeenCalledWith(expect.stringContaining('Codex controls'), 'info');
      expect(configUpdate.update).not.toHaveBeenCalled();
    }
  );

  it.each([
    { command: 'verbosity' as const, value: 'invalid', usage: '/codexify verbosity' },
    { command: 'reasoning-summary' as const, value: 'invalid', usage: '/codexify reasoning-summary' },
    { command: 'service-tier' as const, value: 'invalid', usage: '/codexify service-tier' },
  ])('shows usage for invalid $command values', async ({ command, value, usage }) => {
    const context = createContext();

    await handleControlCommand(command, value, context, createConfig());

    expect(context.ui.notify).toHaveBeenCalledWith(expect.stringContaining(usage), 'warning');
  });

  it.each([
    {
      command: 'verbosity' as const,
      value: 'high',
      update: { field: 'verbosity', value: 'high' },
      field: 'verbosity' as const,
      stored: 'high',
    },
    {
      command: 'verbosity' as const,
      value: 'off',
      update: { field: 'verbosity', value: 'off' },
      field: 'verbosity' as const,
      stored: undefined,
    },
    {
      command: 'reasoning-summary' as const,
      value: 'detailed',
      update: { field: 'reasoningSummary', value: 'detailed' },
      field: 'reasoningSummary' as const,
      stored: 'detailed',
    },
    {
      command: 'reasoning-summary' as const,
      value: 'off',
      update: { field: 'reasoningSummary', value: 'off' },
      field: 'reasoningSummary' as const,
      stored: undefined,
    },
    {
      command: 'service-tier' as const,
      value: 'priority',
      update: { field: 'serviceTier', value: 'priority' },
      field: 'serviceTier' as const,
      stored: 'priority',
    },
  ])('updates $command to $value', async ({ command, value, update, field, stored }) => {
    const config = createConfig();
    const context = createContext();
    configUpdate.resolveScope.mockReturnValue('project');

    await handleControlCommand(command, value, context, config);

    expect(configUpdate.resolveScope).toHaveBeenCalledWith('/workspace', true);
    expect(configUpdate.update).toHaveBeenCalledWith('/workspace', 'project', update);
    expect(config.controls[field]).toBe(stored);
    expect(context.ui.notify).toHaveBeenCalledWith(expect.stringContaining(`:${value}:project`), 'info');
  });

  it.each([new Error('write failed'), 'write failed'])('reports config update failures from %s', async (error) => {
    const context = createContext();
    configUpdate.update.mockRejectedValue(error);

    await handleControlCommand('service-tier', 'default', context, createConfig());

    expect(context.ui.notify).toHaveBeenCalledWith('codexify service-tier failed: write failed', 'error');
  });
});

function createConfig(): PiCodexifyConfig {
  return {
    ...defaultConfig,
    controls: { ...defaultConfig.controls },
  };
}

function createContext(): ExtensionCommandContext & { ui: { notify: ReturnType<typeof vi.fn> } } {
  return {
    cwd: '/workspace',
    model: undefined,
    isProjectTrusted: () => true,
    ui: { notify: vi.fn() },
  } as unknown as ExtensionCommandContext & { ui: { notify: ReturnType<typeof vi.fn> } };
}
