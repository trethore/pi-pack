import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccount } from '#pi-account/accounts.js';
import { createAccountThinking } from '#pi-account/thinking.js';

const account = createAccount('personal', 'test-provider');
const target = { model: { provider: account.baseProvider, id: 'test-model' } };
let directory: string | undefined;

afterEach(async () => {
  vi.unstubAllEnvs();
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

describe('account reasoning settings', () => {
  it.each([
    { trusted: true, expected: 'low' },
    { trusted: false, expected: 'high' },
  ] as const)('reads saved settings with project trust set to $trusted', async ({ trusted, expected }) => {
    // Arrange
    const { thinking, ctx, globalPath, projectPath } = await createHarness(trusted);
    const globalSettings = JSON.stringify({ modelThinkingLevels: { 'test-provider/test-model': 'high' } });
    const projectSettings = JSON.stringify({ modelThinkingLevels: { 'test-provider/test-model': 'low' } });
    await writeFile(globalPath, globalSettings);
    await writeFile(projectPath, projectSettings);

    // Act
    const level = thinking.resolve(account, target, ctx);

    // Assert
    expect(level).toBe(expected);
    expect(await readFile(globalPath, 'utf8')).toBe(globalSettings);
    expect(await readFile(projectPath, 'utf8')).toBe(projectSettings);
  });

  it('reads updated saved reasoning levels without restarting the session', async () => {
    // Arrange
    const { thinking, ctx, globalPath } = await createHarness(false);
    await writeFile(globalPath, JSON.stringify({ defaultThinkingLevel: 'low' }));

    // Act
    const initial = thinking.resolve(account, target, ctx);
    await writeFile(globalPath, JSON.stringify({ defaultThinkingLevel: 'high' }));
    const updated = thinking.resolve(account, target, ctx);

    // Assert
    expect(initial).toBe('low');
    expect(updated).toBe('high');
  });
});

async function createHarness(trusted: boolean) {
  directory = await mkdtemp(path.join(tmpdir(), 'pi-account-thinking-'));
  const agentDir = path.join(directory, 'agent');
  const cwd = path.join(directory, 'project');
  await mkdir(agentDir);
  await mkdir(path.join(cwd, '.pi'), { recursive: true });
  vi.stubEnv('PI_CODING_AGENT_DIR', agentDir);
  const pi = {
    getThinkingLevel: () => 'medium' as const,
    setThinkingLevel: vi.fn(),
    setModel: vi.fn(async () => true),
  };
  const ctx = { cwd, isProjectTrusted: () => trusted } as unknown as ExtensionContext;
  return {
    thinking: createAccountThinking(pi),
    ctx,
    globalPath: path.join(agentDir, 'settings.json'),
    projectPath: path.join(cwd, '.pi', 'settings.json'),
  };
}
