import type { ExecOptions, ExecResult } from '@earendil-works/pi-coding-agent';
import { describe, expect, it, vi } from 'vitest';
import type { PiPromptCommandConfig } from '#pi-prompt-command/config/schema.js';
import { replaceCommandPlaceholders } from '#pi-prompt-command/prompt-command/placeholder.js';

const baseConfig: PiPromptCommandConfig = {
  enabled: true,
  surfaces: {
    system: true,
    appendSystem: true,
    promptTemplates: true,
    contextFiles: false,
    skills: false,
  },
  timeoutMs: 30_000,
  maxOutputBytes: 20_000,
  permissions: {
    '*': 'deny',
    'npm test': 'allow',
    'git *': 'allow',
    'git commit *': 'deny',
  },
};

describe('replaceCommandPlaceholders', () => {
  it('replaces placeholders with stdout and stderr', async () => {
    // Arrange
    const executor = makeExecutor({ stdout: 'ok\n', stderr: 'warn\n', code: 0, killed: false });

    // Act
    const result = await replaceCommandPlaceholders('Status:\n!`npm test`', {
      config: baseConfig,
      executor,
      cwd: '/repo',
      cache: new Map(),
    });

    // Assert
    expect(result).toBe('Status:\nok\nwarn\n');
    expect(executor.exec).toHaveBeenCalledWith('npm', ['test'], {
      cwd: '/repo',
      timeout: 30_000,
      signal: undefined,
    });
  });

  it('denies commands by most specific permission', async () => {
    // Arrange
    const executor = makeExecutor({ stdout: '', stderr: '', code: 0, killed: false });

    // Act
    const result = await replaceCommandPlaceholders('!`git commit -m test`', {
      config: baseConfig,
      executor,
      cwd: '/repo',
      cache: new Map(),
    });

    // Assert
    expect(result).toBe('[pi-prompt-command: denied "git commit -m test"]');
    expect(executor.exec).not.toHaveBeenCalled();
  });

  it('caches command output during one replacement pass', async () => {
    // Arrange
    const executor = makeExecutor({ stdout: 'ok', stderr: '', code: 0, killed: false });
    const cache = new Map<string, Promise<string>>();

    // Act
    const result = await replaceCommandPlaceholders('!`npm test`\n!`npm test`', {
      config: baseConfig,
      executor,
      cwd: '/repo',
      cache,
    });

    // Assert
    expect(result).toBe('ok\nok');
    expect(executor.exec).toHaveBeenCalledOnce();
  });

  it('truncates long output without splitting utf8 characters', async () => {
    // Arrange
    const config = { ...baseConfig, maxOutputBytes: 4 };
    const executor = makeExecutor({ stdout: 'ééé', stderr: '', code: 0, killed: false });

    // Act
    const result = await replaceCommandPlaceholders('!`npm test`', {
      config,
      executor,
      cwd: '/repo',
      cache: new Map(),
    });

    // Assert
    expect(result).toBe('éé\n[pi-prompt-command: output truncated to 4 bytes]');
  });

  it('formats executor failures instead of aborting all replacements', async () => {
    // Arrange
    const executor = {
      exec: vi.fn(() => Promise.reject(new Error('spawn failed'))),
    };

    // Act
    const result = await replaceCommandPlaceholders('!`npm test`', {
      config: baseConfig,
      executor,
      cwd: '/repo',
      cache: new Map(),
    });

    // Assert
    expect(result).toBe('[pi-prompt-command: command failed: spawn failed]');
  });

  it('propagates abort errors', async () => {
    // Arrange
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    const executor = {
      exec: vi.fn(() => Promise.reject(abortError)),
    };

    // Act / Assert
    await expect(
      replaceCommandPlaceholders('!`npm test`', {
        config: baseConfig,
        executor,
        cwd: '/repo',
        cache: new Map(),
      })
    ).rejects.toBe(abortError);
  });
});

function makeExecutor(result: ExecResult) {
  return {
    exec: vi.fn((_command: string, _args: string[], _options?: ExecOptions) =>
      Promise.resolve(result)
    ) as (command: string, args: string[], options?: ExecOptions) => Promise<ExecResult>,
  };
}
