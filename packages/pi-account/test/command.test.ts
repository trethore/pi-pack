import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import {
  initTheme,
  type Theme,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type RegisteredCommand,
} from '@earendil-works/pi-coding-agent';
import { describe, expect, it, vi } from 'vitest';
import { createAccount, defaultAccount } from '#pi-account/accounts.js';
import {
  accountItems,
  applyDefaultAccount,
  handleAccountCommand,
  preserveAccount,
  registerAccountCommand,
  switchAccount,
} from '#pi-account/command.js';
import { AccountSelector } from '#pi-account/selector.js';
import { createAccountProvider } from '#pi-account/provider.js';

const DEFAULT_ACCOUNT = defaultAccount('openai-codex');
const work = createAccount('work');
const personal = createAccount('personal');
const workModel = createAccountProvider(work, openaiCodexProvider()).getModels()[0];
if (!workModel) throw new Error('Missing Codex model');
const personalModel = { ...workModel, provider: personal.provider };

describe('account command', () => {
  it.each(['set', 'cycle'] as const)('preserves the selected account on model %s', async (source) => {
    // Arrange
    const { pi, ctx, manager } = createHarness();
    const selectedModel = { ...personalModel, id: 'another-model', provider: DEFAULT_ACCOUNT.provider };
    const accountModel = { ...selectedModel, provider: personal.provider };
    ctx.model = selectedModel;
    ctx.modelRegistry.getAvailable = () => [accountModel];

    // Act
    await preserveAccount(
      pi,
      manager,
      { type: 'model_select', model: selectedModel, previousModel: personalModel, source },
      ctx
    );

    // Assert
    expect(pi.setModel).toHaveBeenCalledExactlyOnceWith(accountModel);
    expect(pi.setThinkingLevel).toHaveBeenCalledExactlyOnceWith('high');
    expect(manager.store.getDefault).not.toHaveBeenCalled();
    expect(manager.store.setDefault).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'explicit default account', provider: DEFAULT_ACCOUNT.provider, id: personalModel.id, source: 'set' },
    { name: 'explicit saved account', provider: work.provider, id: 'another-model', source: 'set' },
    { name: 'unrelated provider', provider: 'another-provider', id: 'another-model', source: 'set' },
    { name: 'session restoration', provider: DEFAULT_ACCOUNT.provider, id: 'another-model', source: 'restore' },
    { name: 'account remapping', provider: personal.provider, id: 'another-model', source: 'set' },
  ] as const)('does not override $name', async ({ provider, id, source }) => {
    // Arrange
    const { pi, ctx, manager } = createHarness();
    const selectedModel = { ...personalModel, provider, id };
    ctx.model = selectedModel;

    // Act
    await preserveAccount(
      pi,
      manager,
      { type: 'model_select', model: selectedModel, previousModel: personalModel, source },
      ctx
    );

    // Assert
    expect(pi.setModel).not.toHaveBeenCalled();
  });

  it.each(['setDefault work', 'SETDEFAULT Work'])(
    'saves a named default with %s without switching',
    async (command) => {
      // Arrange
      const { pi, ctx, manager } = createHarness();

      // Act
      await handleAccountCommand(pi, manager, command, ctx);

      // Assert
      expect(manager.store.setDefault).toHaveBeenCalledExactlyOnceWith(work);
      expect(pi.setModel).not.toHaveBeenCalled();
    }
  );

  it('saves the current account when no default name is supplied', async () => {
    // Arrange
    const { pi, ctx, manager } = createHarness();

    // Act
    await handleAccountCommand(pi, manager, 'setDefault', ctx);

    // Assert
    expect(manager.store.setDefault).toHaveBeenCalledExactlyOnceWith(personal);
  });

  it('can restore the original provider as the startup default', async () => {
    // Arrange
    const { pi, ctx, manager } = createHarness();

    // Act
    await handleAccountCommand(pi, manager, 'setDefault default', ctx);

    // Assert
    expect(manager.store.setDefault).toHaveBeenCalledExactlyOnceWith(DEFAULT_ACCOUNT);
  });

  it('rejects unknown defaults without writing storage', async () => {
    // Arrange
    const { pi, ctx, manager } = createHarness();

    // Act / Assert
    await expect(handleAccountCommand(pi, manager, 'setDefault missing', ctx)).rejects.toThrow('setDefault');
    expect(manager.store.setDefault).not.toHaveBeenCalled();
  });

  it.each([false, true])('keeps the picker open after saving a default (failure: %s)', async (fails) => {
    // Arrange
    initTheme('dark');
    const { pi, ctx, manager } = createHarness();
    manager.store.getDefault.mockResolvedValue(personal);
    if (fails) manager.store.setDefault.mockRejectedValue(new Error('storage unavailable'));
    const done = vi.fn();
    const requestRender = vi.fn();
    let selector: AccountSelector | undefined;
    ctx.ui.custom = vi.fn(async (factory: Parameters<ExtensionCommandContext['ui']['custom']>[0]) => {
      selector = (await factory(
        { requestRender } as never,
        { fg: (_color: string, text: string) => text } as Theme,
        {} as never,
        done
      )) as AccountSelector;
      selector.handleInput('work');
      selector.handleInput('\u0013');
      await vi.waitFor(() => {
        if (fails) expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining('storage unavailable'), 'error');
        else expect(requestRender).toHaveBeenCalledOnce();
      });
      return undefined as never;
    });

    // Act
    await handleAccountCommand(pi, manager, '', ctx);

    // Assert
    expect(manager.store.setDefault).toHaveBeenCalledExactlyOnceWith(work);
    expect(done).not.toHaveBeenCalled();
    expect(pi.setModel).not.toHaveBeenCalled();
    const rendered = selector?.render(100).join('\n');
    expect(rendered).not.toContain('personal');
    expect(rendered).not.toContain('(startup default)');
    if (fails) expect(rendered).not.toContain('work (default)');
    else expect(rendered).toContain('work (default)');
    selector?.handleInput('\r');
    expect(done).toHaveBeenCalledExactlyOnceWith(work.provider);
  });

  it('applies the saved default for the current base provider on startup', async () => {
    // Arrange
    const { pi, ctx, manager } = createHarness();
    manager.store.getDefault.mockResolvedValue(work);

    // Act
    await applyDefaultAccount(pi, manager, ctx);

    // Assert
    expect(manager.store.getDefault).toHaveBeenCalledExactlyOnceWith('openai-codex');
    expect(pi.setModel).toHaveBeenCalledExactlyOnceWith(workModel);
    expect(pi.setThinkingLevel).toHaveBeenCalledExactlyOnceWith('high');
  });

  it('keeps the session account when no startup default is saved', async () => {
    // Arrange
    const { pi, ctx, manager } = createHarness();

    // Act
    await applyDefaultAccount(pi, manager, ctx);

    // Assert
    expect(pi.setModel).not.toHaveBeenCalled();
  });

  it('changes only this session while preserving the model ID and thinking level', async () => {
    // Arrange
    const first = createHarness();
    const second = createHarness();

    // Act
    await handleAccountCommand(first.pi, first.manager, 'work', first.ctx);

    // Assert
    expect(first.pi.setModel).toHaveBeenCalledExactlyOnceWith(workModel);
    expect(first.pi.setThinkingLevel).toHaveBeenCalledExactlyOnceWith('high');
    expect(first.ctx.modelRegistry.refresh).toHaveBeenCalledWith({ allowNetwork: false });
    expect(first.manager.store.add).not.toHaveBeenCalled();
    expect(second.pi.setModel).not.toHaveBeenCalled();
    expect(second.ctx.model).toEqual(personalModel);
  });

  it('switches back to the existing built-in login', async () => {
    // Arrange
    const { pi, ctx, manager } = createHarness();
    const defaultModel = { ...workModel, provider: DEFAULT_ACCOUNT.provider };
    ctx.modelRegistry.getAvailable = vi.fn(() => [defaultModel]);

    // Act
    await handleAccountCommand(pi, manager, 'default', ctx);

    // Assert
    expect(pi.setModel).toHaveBeenCalledExactlyOnceWith(defaultModel);
  });

  it('does not switch or add accounts while streaming', async () => {
    // Arrange
    const { pi, ctx, manager } = createHarness();
    ctx.isIdle = () => false;

    // Act
    await handleAccountCommand(pi, manager, 'add work', ctx);

    // Assert
    expect(manager.sync).not.toHaveBeenCalled();
    expect(manager.store.add).not.toHaveBeenCalled();
    expect(pi.setModel).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining('Wait'), 'warning');
  });

  it('checks idle state again after the picker closes', async () => {
    // Arrange
    const { pi, ctx, manager } = createHarness();
    ctx.isIdle = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);

    // Act
    await handleAccountCommand(pi, manager, '', ctx);

    // Assert
    expect(ctx.ui.custom).toHaveBeenCalledOnce();
    expect(pi.setModel).not.toHaveBeenCalled();
  });

  it.each(['unconfigured', 'auth check failed'] as const)('prepares native login when %s', async (scenario) => {
    // Arrange
    const { pi, ctx } = createHarness();
    if (scenario === 'unconfigured') ctx.modelRegistry.getProviderAuthStatus = () => ({ configured: false });
    else pi.setModel.mockResolvedValue(false);

    // Act
    await switchAccount(pi, work, ctx);

    // Assert
    expect(ctx.ui.setEditorText).toHaveBeenCalledExactlyOnceWith(`/login ${work.provider}`);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining(`/login ${work.provider}`), 'info');
    expect(pi.setThinkingLevel).not.toHaveBeenCalled();
  });

  it('does not overwrite a draft to prepare login', async () => {
    // Arrange
    const { pi, ctx } = createHarness();
    ctx.ui.getEditorText = () => 'my draft';
    ctx.modelRegistry.getProviderAuthStatus = () => ({ configured: false });

    // Act
    await switchAccount(pi, work, ctx);

    // Assert
    expect(ctx.ui.setEditorText).not.toHaveBeenCalled();
  });

  it('does not silently choose a different model', async () => {
    // Arrange
    const { pi, ctx } = createHarness();
    ctx.model = { ...personalModel, id: 'unavailable-model' };

    // Act
    await switchAccount(pi, work, ctx);

    // Assert
    expect(pi.setModel).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining('/model'), 'warning');
  });

  it('does nothing when the current account is selected', async () => {
    // Arrange
    const { pi, ctx } = createHarness();
    ctx.model = workModel;

    // Act
    await switchAccount(pi, work, ctx);

    // Assert
    expect(pi.setModel).not.toHaveBeenCalled();
  });

  it('adds an alias and prepares login without changing the active account', async () => {
    // Arrange
    const { pi, ctx, manager } = createHarness();

    // Act
    await handleAccountCommand(pi, manager, 'add work', ctx);

    // Assert
    expect(manager.store.add).toHaveBeenCalledExactlyOnceWith('work', 'openai-codex');
    expect(manager.sync).toHaveBeenCalledTimes(2);
    expect(ctx.ui.setEditorText).toHaveBeenCalledWith(`/login ${work.provider}`);
    expect(pi.setModel).not.toHaveBeenCalled();
  });

  it('supports adding an account from the picker', async () => {
    // Arrange
    const { pi, ctx, manager } = createHarness();
    ctx.ui.custom = vi.fn().mockResolvedValue('add');

    // Act
    await handleAccountCommand(pi, manager, '', ctx);

    // Assert
    expect(ctx.ui.input).toHaveBeenCalledOnce();
    expect(manager.store.add).toHaveBeenCalledExactlyOnceWith('work', 'openai-codex');
  });

  it('cancels the picker without changing accounts', async () => {
    // Arrange
    const { pi, ctx, manager } = createHarness();
    ctx.ui.custom = vi.fn();

    // Act
    await handleAccountCommand(pi, manager, '', ctx);

    // Assert
    expect(pi.setModel).not.toHaveBeenCalled();
    expect(manager.store.add).not.toHaveBeenCalled();
  });

  it.each(['rpc', 'json', 'print'] as const)('avoids terminal-only UI in %s mode', async (mode) => {
    // Arrange
    const { pi, ctx, manager } = createHarness();
    ctx.mode = mode;

    // Act
    await handleAccountCommand(pi, manager, '', ctx);

    // Assert
    expect(ctx.ui.custom).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining('/account <name>'), 'info');
  });

  it('reports unknown names without changing accounts', async () => {
    // Arrange
    const { pi, ctx, manager } = createHarness();

    // Act
    await handleAccountCommand(pi, manager, 'missing', ctx);

    // Assert
    expect(pi.setModel).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining('Unknown account'), 'warning');
  });

  it('adds an account for an explicitly selected extension provider', async () => {
    // Arrange
    const { pi, ctx, manager } = createHarness();
    const account = createAccount('company', 'extension-provider');
    manager.store.add.mockResolvedValue(account);

    // Act
    await handleAccountCommand(pi, manager, 'add company extension-provider', ctx);

    // Assert
    expect(manager.store.add).toHaveBeenCalledExactlyOnceWith('company', 'extension-provider');
    expect(ctx.ui.setEditorText).toHaveBeenCalledWith(`/login ${account.provider}`);
    expect(pi.setModel).not.toHaveBeenCalled();
  });

  it('infers the original provider when adding from an existing alias', async () => {
    // Arrange
    const { pi, ctx, manager } = createHarness();
    const current = createAccount('existing', 'extension-provider');
    manager.sync.mockResolvedValue([current]);
    ctx.model = { ...workModel, provider: current.provider };

    // Act
    await handleAccountCommand(pi, manager, 'add company', ctx);

    // Assert
    expect(manager.store.add).toHaveBeenCalledExactlyOnceWith('company', 'extension-provider');
  });

  it('uses the current non-Codex provider for the default account', async () => {
    // Arrange
    const { pi, ctx, manager } = createHarness();
    const current = createAccount('existing', 'extension-provider');
    const defaultModel = { ...workModel, provider: current.baseProvider };
    manager.sync.mockResolvedValue([current]);
    ctx.model = { ...workModel, provider: current.provider };
    ctx.modelRegistry.getAvailable = () => [defaultModel];

    // Act
    await handleAccountCommand(pi, manager, 'default', ctx);

    // Assert
    expect(pi.setModel).toHaveBeenCalledExactlyOnceWith(defaultModel);
  });

  it('accepts an explicit provider for the default account', async () => {
    // Arrange
    const { pi, ctx, manager } = createHarness();
    const defaultModel = { ...workModel, provider: 'extension-provider' };
    ctx.modelRegistry.getAvailable = () => [defaultModel];

    // Act
    await handleAccountCommand(pi, manager, 'default extension-provider', ctx);

    // Assert
    expect(pi.setModel).toHaveBeenCalledExactlyOnceWith(defaultModel);
  });

  it.each(['missing', 'ambient-only', 'alias'] as const)('rejects adding against a %s provider', async (scenario) => {
    // Arrange
    const { pi, ctx, manager } = createHarness();
    let provider = 'extension-provider';
    if (scenario === 'missing') ctx.modelRegistry.getProvider = vi.fn();
    if (scenario === 'ambient-only') {
      ctx.modelRegistry.getProvider = () => ({
        ...openaiCodexProvider(),
        auth: { apiKey: { name: 'Ambient', resolve: vi.fn() } },
      });
    }
    if (scenario === 'alias') provider = work.provider;

    // Act / Assert
    await expect(handleAccountCommand(pi, manager, `add company ${provider}`, ctx)).rejects.toThrow();
    expect(manager.store.add).not.toHaveBeenCalled();
    expect(pi.setModel).not.toHaveBeenCalled();
  });

  it('does not offer login for an unavailable saved provider', async () => {
    // Arrange
    const { pi, ctx } = createHarness();
    ctx.modelRegistry.getProvider = vi.fn();

    // Act
    await switchAccount(pi, work, ctx);

    // Assert
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining('unavailable'), 'warning');
    expect(ctx.ui.setEditorText).not.toHaveBeenCalled();
    expect(pi.setModel).not.toHaveBeenCalled();
  });

  it('does not select models excluded by the provider availability filter', async () => {
    // Arrange
    const { pi, ctx } = createHarness();
    ctx.modelRegistry.getAvailable = () => [];

    // Act
    await switchAccount(pi, work, ctx);

    // Assert
    expect(pi.setModel).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining('not available'), 'warning');
  });

  it('switches using cached available models without requiring network access', async () => {
    // Arrange
    const { pi, ctx } = createHarness();

    // Act
    await switchAccount(pi, work, ctx);

    // Assert
    expect(ctx.modelRegistry.refresh).not.toHaveBeenCalled();
    expect(pi.setModel).toHaveBeenCalledWith(workModel);
  });

  it('discovers a missing model through the selected account refresh hook', async () => {
    // Arrange
    const { pi, ctx } = createHarness();
    ctx.modelRegistry.getAvailable = () => [];
    ctx.modelRegistry.refresh = vi.fn(async () => {
      ctx.modelRegistry.getAvailable = () => [workModel];
      return { errors: new Map(), aborted: false };
    });

    // Act
    await switchAccount(pi, work, ctx);

    // Assert
    expect(ctx.modelRegistry.refresh).toHaveBeenCalledWith({ providers: [work.provider], allowNetwork: true });
    expect(pi.setModel).toHaveBeenCalledWith(workModel);
  });

  it('does not switch after a superseded model refresh', async () => {
    // Arrange
    const { pi, ctx } = createHarness();
    ctx.modelRegistry.getAvailable = () => [];
    ctx.modelRegistry.refresh = vi.fn(async () => {
      ctx.modelRegistry.getAvailable = () => [workModel];
      return { errors: new Map(), aborted: true };
    });

    // Act
    await switchAccount(pi, work, ctx);

    // Assert
    expect(pi.setModel).not.toHaveBeenCalled();
  });

  it('reports dynamic model refresh failures without switching', async () => {
    // Arrange
    const { pi, ctx } = createHarness();
    ctx.modelRegistry.getAvailable = () => [];
    ctx.modelRegistry.refresh = vi.fn(async () => ({
      errors: new Map([[work.provider, new Error('catalog unavailable')]]),
      aborted: false,
    }));

    // Act
    await switchAccount(pi, work, ctx);

    // Assert
    expect(ctx.modelRegistry.refresh).toHaveBeenCalledWith({ providers: [work.provider], allowNetwork: true });
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining('catalog unavailable'), 'warning');
    expect(pi.setModel).not.toHaveBeenCalled();
  });

  it('does not switch if a response starts while model discovery is in flight', async () => {
    // Arrange
    const { pi, ctx } = createHarness();
    ctx.modelRegistry.getAvailable = () => [];
    ctx.modelRegistry.refresh = vi.fn(async () => {
      ctx.isIdle = () => false;
      return { errors: new Map(), aborted: false };
    });

    // Act
    await switchAccount(pi, work, ctx);

    // Assert
    expect(pi.setModel).not.toHaveBeenCalled();
  });

  it('lists defaults for each saved base provider with provider descriptions', async () => {
    // Arrange
    const { ctx } = createHarness();
    const base = { ...openaiCodexProvider(), id: 'extension-provider', name: 'Extension Provider' };
    ctx.modelRegistry.getProvider = () => base;
    const current = createAccount('company', base.id);
    ctx.model = { ...workModel, provider: current.provider };

    // Act
    const items = accountItems([defaultAccount(base.id), current], ctx);

    // Assert
    expect(items.map((item) => item.label)).toEqual(['  default', '* company']);
    expect(items.every((item) => item.description === base.name)).toBe(true);
  });

  it('marks only the account selected by this session', () => {
    // Arrange
    const { ctx } = createHarness();

    // Act / Assert
    expect(accountItems([personal, work], ctx).map((item) => item.label)).toEqual(['* personal', '  work']);
  });

  it('catches errors and completes account names', async () => {
    // Arrange
    const { ctx, manager } = createHarness();
    const commands: RegisteredCommand[] = [];
    const pi = {
      registerCommand: (_name: string, registered: RegisteredCommand) => {
        commands.push(registered);
      },
    } as ExtensionAPI;
    registerAccountCommand(pi, manager);
    const command = commands[0];
    if (!command) throw new Error('Missing account command');
    manager.sync.mockRejectedValue(new Error('storage unavailable'));

    // Act
    await command.handler('work', ctx);

    // Assert
    expect(ctx.ui.notify).toHaveBeenCalledWith('pi-account: storage unavailable', 'error');
    expect(command.getArgumentCompletions?.('wo')).toEqual([{ value: 'work', label: 'work' }]);
  });
});

function createHarness() {
  const pi = {
    setModel: vi.fn(async () => true),
    getThinkingLevel: () => 'high' as const,
    setThinkingLevel: vi.fn(),
  };
  const ctx = {
    mode: 'tui',
    hasUI: true,
    model: personalModel,
    isIdle: () => true,
    modelRegistry: {
      getAll: () => [workModel, personalModel],
      getAvailable: () => [workModel, personalModel],
      getProvider: (id: string) => ({ ...openaiCodexProvider(), id }),
      getProviderAuthStatus: () => ({ configured: true }),
      refresh: vi.fn(async () => ({ errors: new Map(), aborted: false })),
    },
    ui: {
      notify: vi.fn(),
      custom: vi.fn(async () => work.provider),
      input: vi.fn(async () => 'work'),
      getEditorText: () => '',
      setEditorText: vi.fn(),
    },
  } as unknown as ExtensionCommandContext;
  const manager = {
    store: { getDefault: vi.fn(), setDefault: vi.fn(), add: vi.fn(async () => work) },
    sync: vi.fn(async () => [personal, work]),
    list: () => [personal, work],
  };
  return { pi, ctx, manager };
}
