import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { envApiKeyAuth, InMemoryCredentialStore, type Api, type Model, type Provider } from '@earendil-works/pi-ai';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccount } from '#pi-account/accounts.js';
import { registerAccountCommand } from '#pi-account/command.js';
import { createAccountModelHandler } from '#pi-account/models.js';
import { createAccountProvider } from '#pi-account/provider.js';

const base = testProvider('cycle-test', ['a', 'b', 'c']);
const other = testProvider('other-cycle-test', ['other']);
const personal = createAccount('personal', base.id);
const work = createAccount('work', base.id);
const personalProvider = createAccountProvider(personal, base);
const workProvider = createAccountProvider(work, base);
const cleanup: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const dispose of cleanup.splice(0)) await dispose();
});

describe('account model cycling', () => {
  it.each([
    { direction: 'forward', expected: ['b', 'c', 'a', 'b', 'c', 'a'] },
    { direction: 'backward', expected: ['c', 'b', 'a', 'c', 'b', 'a'] },
  ] as const)('cycles every scoped model $direction without losing the account', async ({ direction, expected }) => {
    // Arrange
    const { session, errors, notify } = await createHarness(base.getModels());

    // Act
    const visited = [];
    for (let index = 0; index < expected.length; index++) {
      await session.cycleModel(direction);
      visited.push([session.model?.provider, session.model?.id]);
    }

    // Assert
    expect(errors).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(visited).toEqual(expected.map((id) => [personal.provider, id]));
  });

  it.each(['forward', 'backward'] as const)(
    'remembers the account across providers when cycling %s',
    async (direction) => {
      // Arrange
      const { session, errors } = await createHarness([...base.getModels(), ...other.getModels()]);

      // Act
      const visited = [];
      for (let index = 0; index < 8; index++) {
        await session.cycleModel(direction);
        visited.push([session.model?.provider, session.model?.id]);
      }

      // Assert
      const round =
        direction === 'forward'
          ? [
              [personal.provider, 'b'],
              [personal.provider, 'c'],
              [other.id, 'other'],
              [personal.provider, 'a'],
            ]
          : [
              [other.id, 'other'],
              [personal.provider, 'c'],
              [personal.provider, 'b'],
              [personal.provider, 'a'],
            ];
      expect(visited).toEqual([...round, ...round]);
      expect(errors).not.toHaveBeenCalled();
    }
  );

  it.each(['forward', 'backward'] as const)(
    'deduplicates account aliases in unscoped cycling %s',
    async (direction) => {
      // Arrange
      const { session, errors } = await createHarness([]);

      // Act
      const visited = [];
      for (let index = 0; index < 8; index++) {
        await session.cycleModel(direction);
        visited.push([session.model?.provider, session.model?.id]);
      }

      // Assert
      expect(new Set(visited.map((entry) => entry.join('/')))).toEqual(
        new Set([`${personal.provider}/a`, `${personal.provider}/b`, `${personal.provider}/c`, `${other.id}/other`])
      );
      expect(visited.slice(0, 4)).toEqual(visited.slice(4));
      expect(errors).not.toHaveBeenCalled();
    }
  );

  it.each(['default', 'work'])('honors an explicit /account %s before further cycling', async (name) => {
    // Arrange
    const { session, errors } = await createHarness([...base.getModels(), ...other.getModels()]);

    // Act
    await session.prompt(`/account ${name}`);
    const visited = [];
    for (let index = 0; index < 4; index++) {
      await session.cycleModel();
      visited.push([session.model?.provider, session.model?.id]);
    }

    // Assert
    const provider = name === 'default' ? base.id : work.provider;
    expect(visited).toEqual([
      [provider, 'b'],
      [provider, 'c'],
      [other.id, 'other'],
      [provider, 'a'],
    ]);
    expect(errors).not.toHaveBeenCalled();
  });

  it('restores the previous model rather than falling back when the account lacks a model', async () => {
    // Arrange
    const { session, runtime, settingsManager, errors, notify } = await createHarness(base.getModels());
    settingsManager.setDefaultThinkingLevel('high');
    session.setThinkingLevel('low');
    runtime.registerNativeProvider({
      ...personalProvider,
      getModels: () => personalProvider.getModels().filter((model) => model.id !== 'b'),
    });
    await runtime.refresh({ allowNetwork: false });

    // Act
    await session.cycleModel();

    // Assert
    expect(session.model).toMatchObject({ provider: personal.provider, id: 'a' });
    expect(session.thinkingLevel).toBe('low');
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('not available for personal'), 'warning');
    expect(errors).not.toHaveBeenCalled();
  });

  it('applies the thinking level of the actual scoped target', async () => {
    // Arrange
    const { session, errors } = await createHarness(base.getModels());
    session.setScopedModels(
      base.getModels().map((model) => ({
        model,
        thinkingLevel: model.id === 'c' ? 'low' : 'high',
      }))
    );

    // Act
    await session.cycleModel();
    await session.cycleModel();

    // Assert
    expect(session.model).toMatchObject({ provider: personal.provider, id: 'c' });
    expect(session.thinkingLevel).toBe('low');
    expect(errors).not.toHaveBeenCalled();
  });

  it('supports alternating forward and backward cycles', async () => {
    // Arrange
    const { session, errors } = await createHarness(base.getModels());
    const directions = ['forward', 'backward', 'backward', 'forward', 'forward'] as const;

    // Act
    const visited = [];
    for (const direction of directions) {
      await session.cycleModel(direction);
      visited.push([session.model?.provider, session.model?.id]);
    }

    // Assert
    expect(visited).toEqual(['b', 'a', 'c', 'a', 'b'].map((id) => [personal.provider, id]));
    expect(errors).not.toHaveBeenCalled();
  });

  it.each([
    { provider: base.id, direction: 'forward' },
    { provider: base.id, direction: 'backward' },
    { provider: personal.provider, direction: 'forward' },
    { provider: personal.provider, direction: 'backward' },
  ] as const)(
    'restores saved reasoning levels for $provider when cycling $direction',
    async ({ provider, direction }) => {
      // Arrange
      const { session, settingsManager, errors } = await createHarness(base.getModels());
      settingsManager.setDefaultThinkingLevel('medium');
      settingsManager.setModelThinkingLevel(provider, 'a', 'medium');
      settingsManager.setModelThinkingLevel(provider, 'b', 'low');
      settingsManager.setModelThinkingLevel(provider, 'c', 'high');

      // Act
      const visited = [];
      for (let index = 0; index < 6; index++) {
        await session.cycleModel(direction);
        visited.push([session.model?.id, session.thinkingLevel]);
      }

      // Assert
      const round =
        direction === 'forward'
          ? [
              ['b', 'low'],
              ['c', 'high'],
              ['a', 'medium'],
            ]
          : [
              ['c', 'high'],
              ['b', 'low'],
              ['a', 'medium'],
            ];
      expect(visited).toEqual([...round, ...round]);
      expect(errors).not.toHaveBeenCalled();
    }
  );

  it('resets temporary reasoning changes to the default when cycling away and back', async () => {
    // Arrange
    const { session, settingsManager, errors } = await createHarness(base.getModels());
    settingsManager.setDefaultThinkingLevel('medium');
    session.setThinkingLevel('low');

    // Act
    await session.cycleModel();
    session.setThinkingLevel('high');
    await session.cycleModel();
    await session.cycleModel();
    const firstLevel = session.thinkingLevel;
    await session.cycleModel();

    // Assert
    expect(firstLevel).toBe('medium');
    expect(session.model).toMatchObject({ provider: personal.provider, id: 'b' });
    expect(session.thinkingLevel).toBe('medium');
    expect(settingsManager.getAllModelThinkingLevels()).toEqual({});
    expect(settingsManager.getDefaultThinkingLevel()).toBe('medium');
    expect(errors).not.toHaveBeenCalled();
  });

  it.each(['default', 'work'])(
    'preserves reasoning for /account %s but resets it on the next model change',
    async (name) => {
      // Arrange
      const { session, settingsManager, errors } = await createHarness(base.getModels());
      settingsManager.setDefaultThinkingLevel('high');
      session.setThinkingLevel('low');

      // Act
      await session.prompt(`/account ${name}`);
      const accountLevel = session.thinkingLevel;
      await session.cycleModel();

      // Assert
      expect(accountLevel).toBe('low');
      expect(session.thinkingLevel).toBe('high');
      expect(session.model).toMatchObject({ provider: name === 'default' ? base.id : work.provider, id: 'b' });
      expect(errors).not.toHaveBeenCalled();
    }
  );

  it('prefers account-specific reasoning settings over base-provider settings', async () => {
    // Arrange
    const { session, settingsManager, errors } = await createHarness(base.getModels());
    settingsManager.setModelThinkingLevel(base.id, 'b', 'low');
    settingsManager.setModelThinkingLevel(personal.provider, 'b', 'high');

    // Act
    await session.cycleModel();

    // Assert
    expect(session.model).toMatchObject({ provider: personal.provider, id: 'b' });
    expect(session.thinkingLevel).toBe('high');
    expect(errors).not.toHaveBeenCalled();
  });

  it('keeps explicit scoped reasoning levels ahead of temporary and saved levels', async () => {
    // Arrange
    const { session, settingsManager, errors } = await createHarness(base.getModels());
    settingsManager.setModelThinkingLevel(personal.provider, 'a', 'medium');
    session.setScopedModels(base.getModels().map((model) => ({ model, thinkingLevel: 'high' })));
    session.setThinkingLevel('low');

    // Act
    await session.cycleModel();
    await session.cycleModel();
    await session.cycleModel();

    // Assert
    expect(session.model).toMatchObject({ provider: personal.provider, id: 'a' });
    expect(session.thinkingLevel).toBe('high');
    expect(errors).not.toHaveBeenCalled();
  });

  it('does not cache automatic reasoning changes over updated model settings', async () => {
    // Arrange
    const { session, settingsManager, errors } = await createHarness(base.getModels());
    settingsManager.setModelThinkingLevel(base.id, 'b', 'low');

    // Act
    await session.cycleModel();
    await session.cycleModel();
    settingsManager.setModelThinkingLevel(base.id, 'b', 'high');
    await session.cycleModel();
    await session.cycleModel();

    // Assert
    expect(session.model).toMatchObject({ provider: personal.provider, id: 'b' });
    expect(session.thinkingLevel).toBe('high');
    expect(errors).not.toHaveBeenCalled();
  });

  it('does not carry an intermediate non-reasoning model level into the corrected target', async () => {
    // Arrange
    const { session, runtime, settingsManager, errors } = await createHarness(base.getModels());
    settingsManager.setDefaultThinkingLevel('high');
    const models = base.getModels().map((model) => ({ ...model, reasoning: model.id !== 'b' }));
    const provider = { ...base, getModels: () => models };
    runtime.registerNativeProvider(provider);
    runtime.registerNativeProvider(createAccountProvider(personal, provider));
    await runtime.refresh({ allowNetwork: false });
    session.setScopedModels(models.map((model) => ({ model })));

    // Act
    const visited = [];
    for (let index = 0; index < 3; index++) {
      await session.cycleModel();
      visited.push([session.model?.id, session.thinkingLevel]);
    }

    // Assert
    expect(visited).toEqual([
      ['b', 'off'],
      ['c', 'high'],
      ['a', 'high'],
    ]);
    expect(errors).not.toHaveBeenCalled();
  });

  it('uses reasoning defaults after session start', async () => {
    // Arrange
    const { session, settingsManager, errors } = await createHarness(base.getModels());
    settingsManager.setDefaultThinkingLevel('medium');
    session.setThinkingLevel('low');

    // Act
    await session.bindExtensions({});
    await session.cycleModel();
    await session.cycleModel();
    await session.cycleModel();

    // Assert
    expect(session.model).toMatchObject({ provider: personal.provider, id: 'a' });
    expect(session.thinkingLevel).toBe('medium');
    expect(errors).not.toHaveBeenCalled();
  });

  it.each([
    { action: 'cycle', provider: base.id, configured: false },
    { action: 'cycle', provider: base.id, configured: true },
    { action: 'select', provider: base.id, configured: false },
    { action: 'select', provider: base.id, configured: true },
    { action: 'select', provider: personal.provider, configured: false },
    { action: 'select', provider: personal.provider, configured: true },
  ] as const)(
    'resets reasoning on $action via $provider (configured: $configured)',
    async ({ action, provider, configured }) => {
      // Arrange
      const { session, settingsManager, errors } = await createHarness(base.getModels());
      if (configured) {
        settingsManager.setDefaultThinkingLevel('low');
        settingsManager.setModelThinkingLevel(base.id, 'a', 'high');
        settingsManager.setModelThinkingLevel(personal.provider, 'b', 'medium');
      }
      session.setThinkingLevel('off');

      // Act
      const visited = [];
      for (const id of ['b', 'c', 'a', 'b']) {
        if (action === 'cycle') {
          await session.cycleModel();
        } else {
          const model = base.getModels().find((entry) => entry.id === id);
          if (!model) throw new Error('Missing model fixture');
          await session.setModel({ ...model, provider });
        }
        visited.push([session.model?.provider, session.model?.id, session.thinkingLevel]);
        session.setThinkingLevel('off');
      }

      // Assert
      const levels = configured ? ['medium', 'low', 'high', 'medium'] : ['medium', 'medium', 'medium', 'medium'];
      expect(visited).toEqual(['b', 'c', 'a', 'b'].map((id, index) => [personal.provider, id, levels[index]]));
      expect(errors).not.toHaveBeenCalled();
    }
  );

  it.each(['forward', 'backward'] as const)('cycles a two-model scope %s', async (direction) => {
    // Arrange
    const { session, errors } = await createHarness(base.getModels().slice(0, 2));

    // Act
    const visited = [];
    for (let index = 0; index < 4; index++) {
      await session.cycleModel(direction);
      visited.push([session.model?.provider, session.model?.id]);
    }

    // Assert
    expect(visited).toEqual(['b', 'a', 'b', 'a'].map((id) => [personal.provider, id]));
    expect(errors).not.toHaveBeenCalled();
  });

  it.each(['forward', 'backward'] as const)(
    'does not lose the account during overlapping %s cycles',
    async (direction) => {
      // Arrange
      const { session, errors } = await createHarness(base.getModels());

      // Act
      await Promise.all(Array.from({ length: 10 }, async () => session.cycleModel(direction)));
      await session.cycleModel(direction);

      // Assert
      expect(session.model?.provider).toBe(personal.provider);
      expect(errors).not.toHaveBeenCalled();
    }
  );
});

async function createHarness(scopedModels: readonly Model<Api>[]) {
  const directory = await mkdtemp(path.join(tmpdir(), 'pi-account-cycle-'));
  const credentials = new InMemoryCredentialStore();
  const runtime = await ModelRuntime.create({ credentials, modelsPath: null, refreshOnCreate: false });
  const providers = [base, other, personalProvider, workProvider];
  for (const provider of providers) {
    await credentials.modify(provider.id, async () => ({ type: 'api_key', key: 'test-key' }));
    runtime.registerNativeProvider(provider);
  }
  await runtime.refresh({ providers: providers.map((provider) => provider.id), allowNetwork: false });
  const manager = {
    store: { getDefault: vi.fn(), setDefault: vi.fn(), add: vi.fn() },
    sync: vi.fn(async () => [personal, work]),
    list: () => [personal, work],
  };
  const settingsManager = SettingsManager.inMemory();
  const resourceLoader = new DefaultResourceLoader({
    cwd: directory,
    agentDir: directory,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    extensionFactories: [
      (pi) => {
        const handleModel = createAccountModelHandler(pi, manager, () => settingsManager);
        pi.on('session_start', handleModel);
        pi.on('model_select', handleModel);
        pi.on('thinking_level_select', handleModel);
        registerAccountCommand(pi, manager);
      },
    ],
  });
  await resourceLoader.reload();
  const model = personalProvider.getModels()[0];
  if (!model) throw new Error('Missing model fixture');
  const { session } = await createAgentSession({
    cwd: directory,
    agentDir: directory,
    model,
    modelRuntime: runtime,
    scopedModels: scopedModels.map((entry) => ({ model: entry })),
    thinkingLevel: 'high',
    settingsManager,
    sessionManager: SessionManager.inMemory(directory),
    resourceLoader,
    noTools: 'all',
  });
  const errors = vi.fn();
  const notify = vi.fn();
  await session.bindExtensions({ onError: errors, uiContext: { notify } as unknown as ExtensionContext['ui'] });
  await runtime.refresh({ allowNetwork: false });
  cleanup.push(async () => {
    session.dispose();
    await rm(directory, { recursive: true, force: true });
  });
  return { session, runtime, settingsManager, errors, notify };
}

function testProvider(id: string, modelIds: string[]): Provider {
  const template = openaiCodexProvider().getModels()[0];
  if (!template) throw new Error('Missing model fixture');
  return {
    id,
    name: id,
    auth: { apiKey: envApiKeyAuth('Test API key', []) },
    getModels: () => modelIds.map((modelId) => ({ ...template, provider: id, id: modelId })),
    stream: vi.fn(),
    streamSimple: vi.fn(),
  };
}
