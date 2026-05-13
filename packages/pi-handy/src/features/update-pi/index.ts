import { spawn } from 'node:child_process';
import {
  VERSION,
  type ExtensionAPI,
  type ExtensionCommandContext,
} from '@mariozechner/pi-coding-agent';

type NotificationType = 'info' | 'warning' | 'error' | 'success';

type UpdatePiCommandContext = Pick<ExtensionCommandContext, 'shutdown'> & {
  ui: {
    notify(message: string, type?: NotificationType): void;
  };
};

interface UpdatePiServices {
  getInstalledVersion(): string | undefined;
  getLatestVersion(): Promise<string>;
  startUpdate(): boolean;
}

const PI_PACKAGE_NAME = '@earendil-works/pi-coding-agent';
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
  const currentVersion = services.getInstalledVersion();
  if (!currentVersion) {
    ctx.ui.notify('Unable to determine the current pi version.', 'error');
    return;
  }

  let latestVersion: string;
  try {
    latestVersion = await services.getLatestVersion();
  } catch (error) {
    ctx.ui.notify(`Unable to check for pi updates: ${formatError(error)}`, 'error');
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

export function getInstalledPiVersion(): string | undefined {
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
  try {
    const child = spawn(NPM_COMMAND, ['install', '-g', PI_PACKAGE_NAME], {
      detached: true,
      stdio: 'ignore',
    });
    child.on('error', () => {
      // The update check already verified npm is runnable. Prevent an unhandled
      // child process error if the detached install fails to start later.
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
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

function runCommand(
  command: string,
  args: string[]
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });
  });
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

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
