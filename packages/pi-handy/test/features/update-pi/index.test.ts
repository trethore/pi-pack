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
    // Arrange
    const commandContext = createCommandContext();
    const updateServices = createServices({ installedVersion: '1.2.3', latestVersion: '1.2.3' });

    // Act
    await handleUpdatePiCommand(commandContext, updateServices);

    // Assert
    expect(updateServices.startUpdate).not.toHaveBeenCalled();
    expect(commandContext.shutdown).not.toHaveBeenCalled();
    expect(commandContext.ui.notify).toHaveBeenCalledWith(
      'Pi is already up to date (1.2.3).',
      'info'
    );
  });

  it('starts a detached update and quits when a newer version exists', async () => {
    // Arrange
    const commandContext = createCommandContext();
    const updateServices = createServices({ installedVersion: '1.2.3', latestVersion: '1.2.4' });

    // Act
    await handleUpdatePiCommand(commandContext, updateServices);

    // Assert
    expect(updateServices.startUpdate).toHaveBeenCalledOnce();
    expect(commandContext.shutdown).toHaveBeenCalledOnce();
    expect(commandContext.ui.notify).toHaveBeenCalledWith(
      'Updating pi 1.2.3 -> 1.2.4. Pi will quit now.',
      'info'
    );
  });

  it('does not quit when checking the latest version fails', async () => {
    // Arrange
    const commandContext = createCommandContext();
    const updateServices = createServices({
      installedVersion: '1.2.3',
      latestError: new Error('offline'),
    });

    // Act
    await handleUpdatePiCommand(commandContext, updateServices);

    // Assert
    expect(updateServices.startUpdate).not.toHaveBeenCalled();
    expect(commandContext.shutdown).not.toHaveBeenCalled();
    expect(commandContext.ui.notify).toHaveBeenCalledWith(
      'Unable to check for pi updates: offline',
      'error'
    );
  });

  it('checks the latest version from the current pi package', async () => {
    // Arrange
    spawnMock.mockReturnValueOnce(createCommandProcess({ stdout: '1.2.4\n' }));

    // Act and assert
    await expect(getLatestPiVersion()).resolves.toBe('1.2.4');

    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String),
      ['view', EXPECTED_PI_PACKAGE_NAME, 'version'],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
  });

  it('starts the global update from the current pi package', () => {
    // Arrange
    spawnMock.mockReturnValueOnce(createDetachedProcess());

    // Act
    const updateStarted = startGlobalPiUpdate();

    // Assert
    expect(updateStarted).toBe(true);
    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String),
      ['install', '-g', EXPECTED_PI_PACKAGE_NAME],
      { detached: true, stdio: 'ignore' }
    );
  });

  it.each([
    ['1.2.3', '1.2.3', 0],
    ['1.2.4', '1.2.3', 1],
    ['1.10.0', '1.9.9', 1],
    ['1.2.3', '1.2.4', -1],
  ])('compares %s to %s as %i', (leftVersion, rightVersion, expectedComparison) => {
    expect(compareVersions(leftVersion, rightVersion)).toBe(expectedComparison);
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
