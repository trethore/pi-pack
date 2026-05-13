import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const EXPECTED_PI_PACKAGE_NAME = '@earendil-works/pi-coding-agent';
const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

import {
  compareVersions,
  getLatestPiVersion,
  handleUpdatePiCommand,
  startGlobalPiUpdate,
} from '#pi-handy/features/update-pi/index.js';

describe('update pi command', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it('does not quit when pi is already up to date', async () => {
    const ctx = createCommandContext();
    const services = createServices({ installedVersion: '1.2.3', latestVersion: '1.2.3' });

    await handleUpdatePiCommand(ctx, services);

    expect(services.startUpdate).not.toHaveBeenCalled();
    expect(ctx.shutdown).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith('Pi is already up to date (1.2.3).', 'info');
  });

  it('starts a detached update and quits when a newer version exists', async () => {
    const ctx = createCommandContext();
    const services = createServices({ installedVersion: '1.2.3', latestVersion: '1.2.4' });

    await handleUpdatePiCommand(ctx, services);

    expect(services.startUpdate).toHaveBeenCalledOnce();
    expect(ctx.shutdown).toHaveBeenCalledOnce();
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      'Updating pi 1.2.3 -> 1.2.4. Pi will quit now.',
      'info'
    );
  });

  it('does not quit when checking the latest version fails', async () => {
    const ctx = createCommandContext();
    const services = createServices({
      installedVersion: '1.2.3',
      latestError: new Error('offline'),
    });

    await handleUpdatePiCommand(ctx, services);

    expect(services.startUpdate).not.toHaveBeenCalled();
    expect(ctx.shutdown).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith('Unable to check for pi updates: offline', 'error');
  });

  it('checks the latest version from the current pi package', async () => {
    spawnMock.mockReturnValueOnce(createCommandProcess({ stdout: '1.2.4\n' }));

    await expect(getLatestPiVersion()).resolves.toBe('1.2.4');

    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String),
      ['view', EXPECTED_PI_PACKAGE_NAME, 'version'],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
  });

  it('starts the global update from the current pi package', () => {
    spawnMock.mockReturnValueOnce(createDetachedProcess());

    expect(startGlobalPiUpdate()).toBe(true);

    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String),
      ['install', '-g', EXPECTED_PI_PACKAGE_NAME],
      { detached: true, stdio: 'ignore' }
    );
  });

  it('compares semantic versions', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('1.2.4', '1.2.3')).toBe(1);
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.2.3', '1.2.4')).toBe(-1);
  });
});

function createCommandContext() {
  return {
    shutdown: vi.fn(),
    ui: {
      notify: vi.fn(),
    },
  };
}

function createCommandProcess(options: { stdout?: string; stderr?: string; exitCode?: number }) {
  const child = {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    on: vi.fn((event: string, handler: (value: Error | number | null) => void) => {
      if (event === 'close') {
        queueMicrotask(() => {
          child.stdout.end(options.stdout ?? '');
          child.stderr.end(options.stderr ?? '');
          handler(options.exitCode ?? 0);
        });
      }
      return child;
    }),
  };

  return child;
}

function createDetachedProcess() {
  return {
    on: vi.fn(),
    unref: vi.fn(),
  };
}

function createServices(options: {
  installedVersion?: string;
  latestVersion?: string;
  latestError?: Error;
}) {
  return {
    getInstalledVersion: vi.fn(() => options.installedVersion),
    getLatestVersion: vi.fn(async () => {
      if (options.latestError) throw options.latestError;
      return options.latestVersion ?? '0.0.0';
    }),
    startUpdate: vi.fn(() => true),
  };
}
