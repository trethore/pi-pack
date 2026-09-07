import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AccountStore, createAccount } from '#pi-account/accounts.js';

describe('account names', () => {
  it.each([
    [' Personal ', 'personal'],
    ['work-2', 'work-2'],
    ['team_one', 'team_one'],
  ])('normalizes %s to %s', (input, name) => {
    // Act / Assert
    expect(createAccount(input)).toEqual({
      name,
      baseProvider: 'openai-codex',
      provider: `openai-codex-account-${name}`,
    });
  });

  it.each(['', 'two providers', 'bad\nprovider'])('rejects invalid provider ID %j', (provider) => {
    // Act / Assert
    expect(() => createAccount('work', provider)).toThrow('provider ID');
  });

  it('keeps alias IDs distinct for different providers', () => {
    // Act / Assert
    expect(createAccount('work', 'openai').provider).not.toBe(createAccount('work', 'anthropic').provider);
    expect(createAccount('work', 'custom/provider').provider).toMatch(/^pi-account-[a-f0-9]+-work$/);
  });

  it.each(['', '../work', '/work', 'a/b', String.raw`a\b`, 'two accounts', 'default', 'ADD', '_work', 'a'.repeat(49)])(
    'rejects invalid or reserved name %s',
    (name) => {
      // Act / Assert
      expect(() => createAccount(name)).toThrow();
    }
  );
});

describe('account storage', () => {
  let agentDir: string;
  let store: AccountStore;

  beforeEach(async () => {
    agentDir = await mkdtemp(path.join(tmpdir(), 'pi-account-test-'));
    store = new AccountStore(agentDir);
  });

  afterEach(async () => {
    await rm(agentDir, { recursive: true, force: true });
  });

  it('starts empty without creating files', async () => {
    // Act / Assert
    expect(await store.list()).toEqual([]);
    expect(await readdir(agentDir)).toEqual([]);
  });

  it('persists names across instances without storing credentials', async () => {
    // Arrange
    const account = await store.add('Work');
    const filePath = path.join(agentDir, 'pi-account', 'accounts', 'work.json');

    // Act
    const reloaded = await new AccountStore(agentDir).list();
    const metadata = await stat(filePath);

    // Assert
    expect(reloaded).toEqual([account]);
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual({ name: 'work', baseProvider: 'openai-codex' });
    expect(metadata.mode & 0o777).toBe(0o600);
    expect(await readdir(agentDir)).toEqual(['pi-account']);
  });

  it('loads legacy Codex metadata without changing its credential ID', async () => {
    // Arrange
    const directory = path.join(agentDir, 'pi-account', 'accounts');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'work.json'), '{"name":"work"}');

    // Act
    const accounts = await store.list();
    await store.add('work', 'openai-codex');

    // Assert
    expect(accounts).toEqual([createAccount('work', 'openai-codex')]);
    expect(accounts[0]?.provider).toBe('openai-codex-account-work');
  });

  it('persists the base provider for extension accounts', async () => {
    // Arrange
    const account = await store.add('work', 'my-extension');

    // Act
    const reloaded = await new AccountStore(agentDir).list();

    // Assert
    expect(reloaded).toEqual([account]);
    expect(reloaded[0]?.baseProvider).toBe('my-extension');
    expect(JSON.parse(await readFile(path.join(agentDir, 'pi-account', 'accounts', 'work.json'), 'utf8'))).toEqual({
      name: 'work',
      baseProvider: 'my-extension',
    });
  });

  it('does not reassign an existing name to another provider', async () => {
    // Arrange
    const original = await store.add('work', 'openai-codex');

    // Act / Assert
    await expect(store.add('work', 'anthropic')).rejects.toThrow('already belongs');
    expect(await store.list()).toEqual([original]);
  });

  it('prevents concurrent additions from assigning one name to different providers', async () => {
    // Arrange
    const otherStore = new AccountStore(agentDir);

    // Act
    const results = await Promise.allSettled([store.add('work', 'openai'), otherStore.add('work', 'anthropic')]);
    const saved = await store.list();

    // Assert
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(saved).toHaveLength(1);
    expect(await readdir(path.join(agentDir, 'pi-account', 'accounts'))).toEqual(['work.json']);
  });

  it('does not lose concurrent additions from separate instances', async () => {
    // Arrange
    const otherStore = new AccountStore(agentDir);

    // Act
    await Promise.all([store.add('work'), otherStore.add('personal'), otherStore.add('work')]);
    const accounts = await store.list();
    const files = await readdir(path.join(agentDir, 'pi-account', 'accounts'));

    // Assert
    expect(accounts.map((account) => account.name)).toEqual(['personal', 'work']);
    expect(files.sort()).toEqual(['personal.json', 'work.json']);
  });

  it('ignores unfinished temporary files', async () => {
    // Arrange
    await store.add('work');
    await writeFile(path.join(agentDir, 'pi-account', 'accounts', 'unfinished.tmp'), '{');

    // Act / Assert
    expect(await store.list()).toEqual([createAccount('work')]);
  });

  it.each([
    '{',
    '{"name":42}',
    '{"name":"personal"}',
    '{"name":"../work"}',
    '{"name":"work","baseProvider":42}',
    '{"name":"work","baseProvider":""}',
  ])('rejects malformed account metadata: %s', async (contents) => {
    // Arrange
    const directory = path.join(agentDir, 'pi-account', 'accounts');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'work.json'), contents);

    // Act / Assert
    await expect(store.list()).rejects.toThrow();
  });
});
