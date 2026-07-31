import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { createDeferred } from '@trethore/pi-shared/test/deferred.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PiBashCommandsConfig } from '#pi-bash-commands/config/schema.js';
import { createBashCommandsRuntime } from '#pi-bash-commands/core/runtime.js';
import type { CommandShims } from '#pi-bash-commands/core/shims.js';

const mocks = vi.hoisted(() => ({
  createCommandShims: vi.fn(),
}));

vi.mock('#pi-bash-commands/core/shims.js', () => ({
  createCommandShims: mocks.createCommandShims,
}));

describe('createBashCommandsRuntime', () => {
  beforeEach(() => {
    mocks.createCommandShims.mockReset();
  });

  it('shares one pending setup across concurrent ensure calls', async () => {
    // Arrange
    const setup = createDeferred<CommandShims>();
    const shims = createShims();
    mocks.createCommandShims.mockReturnValue(setup.promise);
    const runtime = createBashCommandsRuntime(createPi(), config());

    // Act
    const first = runtime.ensure(createContext());
    const second = runtime.ensure(createContext());
    setup.resolve(shims);

    // Assert
    await expect(first).resolves.toBe(shims);
    await expect(second).resolves.toBe(shims);
    expect(mocks.createCommandShims).toHaveBeenCalledTimes(1);
    await runtime.dispose();
    expect(shims.dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes a setup that finishes during runtime disposal', async () => {
    // Arrange
    const setup = createDeferred<CommandShims>();
    const shims = createShims();
    mocks.createCommandShims.mockReturnValue(setup.promise);
    const runtime = createBashCommandsRuntime(createPi(), config());

    // Act
    const pendingEnsure = runtime.ensure(createContext());
    const pendingDispose = runtime.dispose();
    setup.resolve(shims);

    // Assert
    await expect(pendingEnsure).resolves.toBeUndefined();
    await pendingDispose;
    expect(shims.dispose).toHaveBeenCalledTimes(1);
  });

  it('deduplicates setup warnings until the runtime is reset', async () => {
    // Arrange
    mocks.createCommandShims.mockRejectedValue(new Error('setup failed'));
    const notify = vi.fn();
    const runtime = createBashCommandsRuntime(createPi(), config());
    const ctx = createContext(notify);

    // Act
    await runtime.ensure(ctx);
    await runtime.ensure(ctx);
    await runtime.dispose();
    await runtime.ensure(ctx);

    // Assert
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledWith('pi-bash-commands disabled: setup failed', 'warning');
  });
});

function createPi(): Pick<ExtensionAPI, 'getActiveTools' | 'getAllTools'> {
  return {
    getActiveTools: () => ['bash'],
    getAllTools: () =>
      [
        {
          name: 'bash',
          description: '',
          parameters: {},
          sourceInfo: { path: '', source: 'builtin', scope: 'temporary', origin: 'top-level' },
        },
      ] as ReturnType<ExtensionAPI['getAllTools']>,
  };
}

function createContext(notify = vi.fn()): ExtensionContext {
  return { ui: { notify } } as unknown as ExtensionContext;
}

function createShims(): CommandShims {
  return {
    directory: '/temporary/pi-bash-commands',
    dispose: vi.fn(async () => {}),
  };
}

function config(): PiBashCommandsConfig {
  return {
    enabled: true,
    commands: [{ enabled: true, name: 'example', command: process.execPath, args: [], env: {} }],
  };
}
