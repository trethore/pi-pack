import { realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { SessionManager } from '@mariozechner/pi-coding-agent';

type NotificationType = 'info' | 'warning' | 'error' | 'success';

interface SwitchWorkspaceReplacementContext {
  cwd: string;
  ui: {
    notify(message: string, type?: NotificationType): void;
  };
}

interface SwitchWorkspaceCommandContext extends SwitchWorkspaceReplacementContext {
  sessionManager: {
    getSessionFile(): string | undefined;
  };
  waitForIdle(): Promise<void>;
  switchSession(
    sessionPath: string,
    options?: {
      cwdOverride?: string;
      withSession?: (ctx: SwitchWorkspaceReplacementContext) => Promise<void>;
    }
  ): Promise<{ cancelled: boolean }>;
}

export function registerSwitchWorkspaceCommand(pi: ExtensionAPI) {
  pi.registerCommand('switchworkspace', {
    description: "Switch Pi's current workspace directory",
    handler: async (args, ctx) => {
      await handleSwitchWorkspaceCommand(args, ctx as SwitchWorkspaceCommandContext);
    },
  });
}

export async function handleSwitchWorkspaceCommand(
  args: string,
  ctx: SwitchWorkspaceCommandContext
): Promise<void> {
  const requestedPath = args.trim();

  if (requestedPath.length === 0) {
    ctx.ui.notify('Usage: /switchworkspace <path>', 'warning');
    return;
  }

  const targetPath = await resolveWorkspacePath(requestedPath, ctx.cwd);
  const validation = await validateWorkspacePath(targetPath);
  if (!validation.ok) {
    ctx.ui.notify(validation.message, 'warning');
    return;
  }

  if (validation.path === ctx.cwd) {
    ctx.ui.notify(`Already in workspace: ${validation.path}`, 'info');
    return;
  }

  await ctx.waitForIdle();

  const sessionManager = createWorkspaceSession(
    validation.path,
    ctx.sessionManager.getSessionFile()
  );
  const sessionPath = sessionManager.getSessionFile();
  if (!sessionPath) {
    ctx.ui.notify('Unable to create a session for the target workspace.', 'error');
    return;
  }

  const result = await ctx.switchSession(sessionPath, {
    cwdOverride: validation.path,
    withSession: async (newCtx) => {
      newCtx.ui.notify(`Switched workspace: ${newCtx.cwd}`, 'info');
    },
  });

  if (result.cancelled) {
    ctx.ui.notify('Workspace switch cancelled.', 'warning');
  }
}

export async function resolveWorkspacePath(pathInput: string, cwd: string): Promise<string> {
  return path.resolve(cwd, expandHomePath(stripMatchingQuotes(pathInput)));
}

function createWorkspaceSession(
  targetPath: string,
  sourceSessionPath: string | undefined
): SessionManager {
  if (!sourceSessionPath) return SessionManager.create(targetPath);

  try {
    return SessionManager.forkFrom(sourceSessionPath, targetPath);
  } catch {
    return SessionManager.create(targetPath);
  }
}

async function validateWorkspacePath(
  pathInput: string
): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
  let canonicalPath: string;
  try {
    canonicalPath = await realpath(pathInput);
  } catch (error) {
    return { ok: false, message: `Workspace does not exist: ${formatFsError(pathInput, error)}` };
  }

  try {
    const stats = await stat(canonicalPath);
    if (!stats.isDirectory()) {
      return { ok: false, message: `Workspace is not a directory: ${canonicalPath}` };
    }
  } catch (error) {
    return {
      ok: false,
      message: `Workspace is not accessible: ${formatFsError(canonicalPath, error)}`,
    };
  }

  return { ok: true, path: canonicalPath };
}

function stripMatchingQuotes(value: string): string {
  if (value.length < 2) return value;

  const first = value[0];
  const last = value.at(-1);
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

function expandHomePath(value: string): string {
  if (value === '~') return homedir();
  if (value.startsWith('~/') || value.startsWith('~\\'))
    return path.resolve(homedir(), value.slice(2));
  return value;
}

function formatFsError(pathInput: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${pathInput} (${message})`;
}
