import {
  VERSION,
  type ExtensionAPI,
  type ExtensionCommandContext,
} from '@earendil-works/pi-coding-agent';
import { getErrorMessage } from '@trethore/pi-shared/error.js';
import { runCommand, startDetachedCommand } from '@trethore/pi-shared/process.js';

type NotificationType = 'info' | 'warning' | 'error' | 'success';

type UpdatePiCommandContext = Pick<ExtensionCommandContext, 'shutdown'> & {
  ui: {
    notify(message: string, type?: NotificationType): void;
  };
};

interface UpdatePiServices {
  getInstalledVersion(): Promise<string | undefined>;
  getLatestVersion(): Promise<string>;
  startUpdate(): boolean;
}

const PI_PACKAGE_NAME = '@earendil-works/pi-coding-agent';
const PI_COMMAND = process.platform === 'win32' ? 'pi.cmd' : 'pi';
const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const defaultUpdatePiServices: UpdatePiServices = {
  getInstalledVersion: getInstalledPiVersion,
  getLatestVersion: getLatestPiVersion,
  startUpdate: startGlobalPiUpdate,
};

export function registerUpdatePiCommand(pi: ExtensionAPI) {
  pi.registerCommand('updatepi', {
    description: 'Update pi to the latest global version',
    handler: async (_args, ctx) => {
      await handleUpdatePiCommand(ctx);
    },
  });
}

export async function handleUpdatePiCommand(
  ctx: UpdatePiCommandContext,
  services: UpdatePiServices = defaultUpdatePiServices
): Promise<void> {
  let currentVersion: string | undefined;
  try {
    currentVersion = await services.getInstalledVersion();
  } catch (error) {
    ctx.ui.notify(`Unable to determine the current pi version: ${getErrorMessage(error)}`, 'error');
    return;
  }

  if (!currentVersion) {
    ctx.ui.notify('Unable to determine the current pi version.', 'error');
    return;
  }

  let latestVersion: string;
  try {
    latestVersion = await services.getLatestVersion();
  } catch (error) {
    ctx.ui.notify(`Unable to check for pi updates: ${getErrorMessage(error)}`, 'error');
    return;
  }

  if (compareVersions(currentVersion, latestVersion) >= 0) {
    ctx.ui.notify(`Pi is already up to date (${currentVersion}).`, 'info');
    return;
  }

  const started = services.startUpdate();
  if (!started) {
    ctx.ui.notify('Unable to start pi update process.', 'error');
    return;
  }

  ctx.ui.notify(`Updating pi ${currentVersion} -> ${latestVersion}. Pi will quit now.`, 'info');
  ctx.shutdown();
}

async function getInstalledPiVersion(): Promise<string | undefined> {
  try {
    const result = await runCommand(PI_COMMAND, ['--version']);
    if (result.exitCode === 0) {
      const version = result.stdout.trim();
      if (isVersion(version)) return version;
    }
  } catch {
    // Fall back to the loaded package version when the global pi binary is unavailable.
  }

  return isVersion(VERSION) ? VERSION : undefined;
}

export async function getLatestPiVersion(): Promise<string> {
  const result = await runCommand(NPM_COMMAND, ['view', PI_PACKAGE_NAME, 'version']);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || `npm exited with code ${result.exitCode}`);
  }

  const version = result.stdout.trim();
  if (!isVersion(version)) throw new Error(`npm returned an invalid version: ${version}`);
  return version;
}

export function startGlobalPiUpdate(): boolean {
  return startDetachedCommand(NPM_COMMAND, ['install', '-g', '--force', PI_PACKAGE_NAME]);
}

export function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);

  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }

  return 0;
}

function isVersion(value: string): boolean {
  return /^\d+\.\d+\.\d+(?:[-+].*)?$/.test(value);
}

function parseVersion(version: string): number[] {
  return version
    .split(/[+-]/, 1)[0]
    .split('.')
    .map((part) => Number.parseInt(part, 10));
}
