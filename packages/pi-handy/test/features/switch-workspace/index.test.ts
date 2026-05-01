import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const sessionCreate = vi.fn();
const sessionForkFrom = vi.fn();

vi.mock('@mariozechner/pi-coding-agent', async (importActual) => ({
  ...(await importActual<typeof import('@mariozechner/pi-coding-agent')>()),
  SessionManager: {
    create: sessionCreate,
    forkFrom: sessionForkFrom,
  },
}));

const { handleSwitchWorkspaceCommand, resolveWorkspacePath } =
  await import('#pi-handy/features/switch-workspace/index.js');

const tempPaths: string[] = [];

describe('switch workspace command', () => {
  afterEach(() => {
    sessionCreate.mockReset();
    sessionForkFrom.mockReset();
    for (const tempPath of tempPaths.splice(0)) {
      rmSync(tempPath, { force: true, recursive: true });
    }
  });

  it('treats the full command argument as a path so spaces do not need quotes', async () => {
    const root = makeTempDirectory();
    const target = path.join(root, 'workspace with spaces');
    mkdirSync(target);
    const sessionPath = path.join(root, 'session.jsonl');
    const sourceSessionPath = path.join(root, 'source.jsonl');
    const ctx = createContext(root, sourceSessionPath);
    sessionForkFrom.mockReturnValue({ getSessionFile: () => sessionPath });

    await handleSwitchWorkspaceCommand(`  ${target}  `, ctx);

    const canonicalTarget = await realpathForTest(target);
    expect(sessionForkFrom).toHaveBeenCalledWith(sourceSessionPath, canonicalTarget);
    expect(sessionCreate).not.toHaveBeenCalled();
    expect(ctx.idleWaits).toBe(1);
    expect(ctx.switches).toEqual([
      {
        sessionPath,
        options: expect.objectContaining({ cwdOverride: canonicalTarget }),
      },
    ]);
    expect(ctx.notifications).toEqual([
      { message: `Switched workspace: ${canonicalTarget}`, type: 'info' },
    ]);
  });

  it('resolves relative paths against the current Pi cwd', async () => {
    const root = makeTempDirectory();

    await expect(resolveWorkspacePath('child directory', root)).resolves.toBe(
      path.resolve(root, 'child directory')
    );
  });

  it('accepts matching quotes for compatibility', async () => {
    const root = makeTempDirectory();

    await expect(resolveWorkspacePath('"child directory"', root)).resolves.toBe(
      path.resolve(root, 'child directory')
    );
  });

  it('rejects an empty path', async () => {
    const ctx = createContext(makeTempDirectory());

    await handleSwitchWorkspaceCommand('   ', ctx);

    expect(ctx.switches).toEqual([]);
    expect(ctx.notifications).toEqual([
      { message: 'Usage: /switchworkspace <path>', type: 'warning' },
    ]);
  });

  it('rejects a file path', async () => {
    const root = makeTempDirectory();
    const filePath = path.join(root, 'file.txt');
    writeFileSync(filePath, 'not a directory');
    const ctx = createContext(root);

    await handleSwitchWorkspaceCommand(filePath, ctx);

    expect(ctx.switches).toEqual([]);
    expect(ctx.notifications).toEqual([
      {
        message: `Workspace is not a directory: ${await realpathForTest(filePath)}`,
        type: 'warning',
      },
    ]);
  });
});

interface TestReplacementContext {
  cwd: string;
  ui: {
    notify(message: string, type?: 'info' | 'warning' | 'error' | 'success'): void;
  };
}

interface TestContext extends TestReplacementContext {
  notifications: Array<{ message: string; type: string | undefined }>;
  switches: Array<{ sessionPath: string; options: { cwdOverride?: string } }>;
  idleWaits: number;
  sessionManager: {
    getSessionFile(): string | undefined;
  };
  waitForIdle(): Promise<void>;
  switchSession(
    sessionPath: string,
    options?: { cwdOverride?: string; withSession?: (ctx: TestReplacementContext) => Promise<void> }
  ): Promise<{ cancelled: boolean }>;
}

function createContext(cwd: string, sessionFile?: string): TestContext {
  const notifications: Array<{ message: string; type: string | undefined }> = [];
  const switches: Array<{ sessionPath: string; options: { cwdOverride?: string } }> = [];

  const ctx = {
    cwd,
    notifications,
    switches,
    idleWaits: 0,
    ui: {
      notify(message: string, type?: 'info' | 'warning' | 'error' | 'success') {
        notifications.push({ message, type });
      },
    },
    sessionManager: {
      getSessionFile: () => sessionFile,
    },
    async waitForIdle() {
      ctx.idleWaits += 1;
    },
    async switchSession(
      sessionPath: string,
      options?: {
        cwdOverride?: string;
        withSession?: (ctx: TestReplacementContext) => Promise<void>;
      }
    ) {
      const switchOptions = options ?? {};
      switches.push({ sessionPath, options: switchOptions });
      await switchOptions.withSession?.({
        cwd: switchOptions.cwdOverride ?? ctx.cwd,
        ui: ctx.ui,
      });
      return { cancelled: false };
    },
  };

  return ctx;
}

function makeTempDirectory(): string {
  const tempPath = path.join(tmpdir(), `pi-handy-switch-workspace-${randomUUID()}`);
  mkdirSync(tempPath, { recursive: true });
  tempPaths.push(tempPath);
  return tempPath;
}

async function realpathForTest(value: string): Promise<string> {
  return await import('node:fs/promises').then((fs) => fs.realpath(value));
}
