import { beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({ spawn: spawnMock }));
vi.mock('#src/utils/ripgrep-executable.js', () => ({
  getRipgrepExecutable: () => '/mock/rg',
}));

import { runRipgrepLines } from '#pi-toolbox/utils/ripgrep-runner.js';

type Listener = (...args: unknown[]) => void;

const returnTrue = () => true;

class MockEmitter {
  private readonly listeners = new Map<string, Listener[]>();

  on(eventName: string, listener: Listener): this {
    this.listeners.set(eventName, [...(this.listeners.get(eventName) ?? []), listener]);
    return this;
  }

  emit(eventName: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(eventName) ?? []) {
      listener(...args);
    }
  }
}

class MockStream extends MockEmitter {
  setEncoding = vi.fn();
}

class MockChildProcess extends MockEmitter {
  stdout = new MockStream();
  stderr = new MockStream();
  kill = vi.fn(returnTrue);
}

describe('runRipgrepLines', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it('spawns ripgrep with the configured cwd and args', async () => {
    // Arrange
    const child = createSpawnedChild();
    const result = runLines();

    // Act
    child.stdout.emit('data', 'one\n');
    child.emit('close', 0);

    // Assert
    await expect(result).resolves.toEqual({ items: ['one'], limited: false });
    expect(spawnMock).toHaveBeenCalledWith('/mock/rg', ['--files'], {
      cwd: '/repo',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(child.stdout.setEncoding).toHaveBeenCalledWith('utf8');
    expect(child.stderr.setEncoding).toHaveBeenCalledWith('utf8');
  });

  it('collects a final line without a trailing newline', async () => {
    // Arrange
    const child = createSpawnedChild();
    const result = runLines();

    // Act
    child.stdout.emit('data', 'one\ntwo');
    child.emit('close', 0);

    // Assert
    await expect(result).resolves.toEqual({ items: ['one', 'two'], limited: false });
  });

  it('deduplicates items before applying the collection limit', async () => {
    // Arrange
    const child = createSpawnedChild();
    const result = runLines({ limit: 2, formatItemKey: (item) => item });

    // Act
    child.stdout.emit('data', 'one\none\ntwo\n');
    child.emit('close', 0);

    // Assert
    await expect(result).resolves.toEqual({ items: ['one', 'two'], limited: false });
  });

  it('kills ripgrep and marks the result limited after collecting one extra item', async () => {
    // Arrange
    const child = createSpawnedChild();
    const result = runLines({ limit: 2 });

    // Act
    child.stdout.emit('data', 'one\ntwo\nthree\n');
    child.stdout.emit('data', 'four\nfive\n');
    child.emit('close', null);

    // Assert
    await expect(result).resolves.toEqual({ items: ['one', 'two'], limited: true });
    expect(child.kill).toHaveBeenCalledTimes(1);
  });

  it('treats ripgrep exit code 1 with no items as an empty result', async () => {
    // Arrange
    const child = createSpawnedChild();
    const result = runLines();

    // Act
    child.emit('close', 1);

    // Assert
    await expect(result).resolves.toEqual({ items: [], limited: false });
  });

  it('rejects with stderr when ripgrep exits with an error', async () => {
    // Arrange
    const child = createSpawnedChild();
    const result = runLines();

    // Act
    child.stderr.emit('data', 'regex parse error\n');
    child.emit('close', 2);

    // Assert
    await expect(result).rejects.toThrow('test_tool failed: regex parse error');
  });

  it('rejects with a clear message when the ripgrep executable is missing', async () => {
    // Arrange
    const child = createSpawnedChild();
    const result = runLines();
    const error = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });

    // Act
    child.emit('error', error);

    // Assert
    await expect(result).rejects.toThrow('test_tool failed: rg executable not found');
  });

  it('rejects without spawning when the signal is already aborted', async () => {
    // Arrange
    const controller = new AbortController();
    controller.abort();

    // Act
    const result = runLines({ signal: controller.signal });

    // Assert
    await expect(result).rejects.toThrow('Operation aborted');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('kills ripgrep and rejects once when the signal aborts after spawning', async () => {
    // Arrange
    const child = createSpawnedChild();
    const controller = new AbortController();
    const result = runLines({ signal: controller.signal });

    // Act
    controller.abort();
    child.emit('close', null);

    // Assert
    await expect(result).rejects.toThrow('Operation aborted');
    expect(child.kill).toHaveBeenCalledTimes(1);
  });
});

function createSpawnedChild(): MockChildProcess {
  const child = new MockChildProcess();
  spawnMock.mockReturnValueOnce(child);
  return child;
}

function runLines(
  options: Partial<Parameters<typeof runRipgrepLines<string>>[0]> = {}
): Promise<{ items: string[]; limited: boolean }> {
  return runRipgrepLines({
    toolName: 'test_tool',
    cwd: '/repo',
    args: ['--files'],
    limit: 10,
    parseLine: (line) => (line.length > 0 ? line : undefined),
    ...options,
  });
}
