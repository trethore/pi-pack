import type { ExecOptions, ExecResult, ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { describe, expect, it, vi } from 'vitest';
import type { PiPromptCommandConfig } from '#pi-prompt-command/config/schema.js';
import { registerPromptCommand } from '#pi-prompt-command/prompt-command/register.js';

const config: PiPromptCommandConfig = {
  enabled: true,
  surfaces: {
    system: true,
    appendSystem: true,
    promptTemplates: true,
    contextFiles: true,
    skills: true,
  },
  timeoutMs: 30_000,
  maxOutputBytes: 20_000,
  permissions: {
    '*': 'deny',
    'npm test': 'allow',
  },
};

type RegisteredHandler = (event: unknown, ctx: unknown) => Promise<unknown> | unknown;

describe('registerPromptCommand', () => {
  it('runs system prompt commands once and reuses the expanded prompt on later turns', async () => {
    // Arrange
    const pi = makePi();
    registerPromptCommand(pi.api, config);
    const beforeAgentStart = pi.handlers.get('before_agent_start')!;
    const firstTurnContext = makeContext([]);
    const laterTurnContext = makeContext([{ type: 'message' }]);
    const event = {
      systemPrompt: 'Prompt !`npm test`',
      systemPromptOptions: {
        customPrompt: 'Prompt !`npm test`',
        cwd: '/repo',
        skills: [],
      },
    };

    // Act
    const firstResult = await beforeAgentStart(event, firstTurnContext);
    const secondResult = await beforeAgentStart(event, laterTurnContext);

    // Assert
    expect(firstResult).toEqual({ systemPrompt: 'Prompt ok' });
    expect(secondResult).toEqual({ systemPrompt: 'Prompt ok' });
    expect(pi.exec).toHaveBeenCalledOnce();
  });

  it('does not expand system prompt commands when attached after the first turn', async () => {
    // Arrange
    const pi = makePi();
    registerPromptCommand(pi.api, config);
    const beforeAgentStart = pi.handlers.get('before_agent_start')!;

    // Act
    const result = await beforeAgentStart(
      {
        systemPrompt: 'Prompt !`npm test`',
        systemPromptOptions: {
          customPrompt: 'Prompt !`npm test`',
          cwd: '/repo',
          skills: [],
        },
      },
      makeContext([{ type: 'message' }])
    );

    // Assert
    expect(result).toBeUndefined();
    expect(pi.exec).not.toHaveBeenCalled();
  });

  it('expands commands when a model reads an available skill file', async () => {
    // Arrange
    const pi = makePi();
    registerPromptCommand(pi.api, config);
    const beforeAgentStart = pi.handlers.get('before_agent_start')!;
    const toolResult = pi.handlers.get('tool_result')!;
    const context = makeContext([]);

    await beforeAgentStart(
      {
        systemPrompt: 'Prompt',
        systemPromptOptions: {
          customPrompt: 'Prompt',
          cwd: '/repo',
          skills: [{ filePath: '/repo/.agents/skills/demo/SKILL.md' }],
        },
      },
      context
    );

    // Act
    const result = await toolResult(
      {
        toolName: 'read',
        input: { path: '.agents/skills/demo/SKILL.md' },
        content: [{ type: 'text', text: 'Skill !`npm test`' }],
        isError: false,
      },
      context
    );

    // Assert
    expect(result).toEqual({ content: [{ type: 'text', text: 'Skill ok' }] });
  });
});

function makePi() {
  const handlers = new Map<string, RegisteredHandler>();
  const exec = vi.fn((_command: string, _args: string[], _options?: ExecOptions) =>
    Promise.resolve({ stdout: 'ok', stderr: '', code: 0, killed: false } satisfies ExecResult)
  );
  const api = {
    on: (event: string, handler: RegisteredHandler) => {
      handlers.set(event, handler);
    },
    exec,
  } as unknown as ExtensionAPI;

  return { api, handlers, exec };
}

function makeContext(branch: Array<{ type: string }>) {
  return {
    cwd: '/repo',
    signal: undefined,
    sessionManager: {
      getSessionId: () => 'session-1',
      getBranch: () => branch,
    },
  };
}
