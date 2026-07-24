import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AgentSession, DefaultResourceLoader, type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it } from 'vitest';
import {
  registerPiContentTransformer,
  removePiContentTransformer,
} from '@trethore/pi-shared/unsafe/content-transform.js';
import { checkPiContentTransformCompatibility } from '@trethore/pi-shared/unsafe/content-transform/compatibility.js';
import { transformExpandedSkillContent } from '@trethore/pi-shared/unsafe/content-transform/skill-invocation.js';
import { getPiContentTransformState, transformPiContent } from '@trethore/pi-shared/unsafe/content-transform/state.js';

const firstId = 'test:first';
const secondId = 'test:second';

interface FakeResourceLoader {
  systemPrompt: string;
  agentsFiles: Array<{ path: string; content: string }>;
  cwd: string;
  settingsManager: { isProjectTrusted(): boolean };
}

interface FakeResourceLoaderPrototype {
  getSystemPrompt(this: FakeResourceLoader): string;
  getAgentsFiles(this: FakeResourceLoader): {
    agentsFiles: Array<{ path: string; content: string }>;
  };
}

function createPi(): ExtensionAPI {
  return { on: () => {} } as unknown as ExtensionAPI;
}

function createFakeResourceLoader(): FakeResourceLoader {
  return {
    systemPrompt: 'system',
    agentsFiles: [{ path: 'AGENTS.md', content: 'agents' }],
    cwd: '/workspace',
    settingsManager: { isProjectTrusted: () => true },
  };
}

function getFakeResourceLoaderPrototype(): FakeResourceLoaderPrototype {
  return DefaultResourceLoader.prototype as unknown as FakeResourceLoaderPrototype;
}

describe('shared Pi content transforms', () => {
  afterEach(() => {
    removePiContentTransformer(firstId);
    removePiContentTransformer(secondId);
  });

  it('recognizes the installed Pi bindings', () => {
    // Arrange
    const expectedCompatibility = { warnings: [], errors: [] };

    // Act
    const compatibility = checkPiContentTransformCompatibility();

    // Assert
    expect(compatibility).toEqual(expectedCompatibility);
  });

  it('composes transformers by registration order', () => {
    // Arrange
    registerPiContentTransformer(createPi(), {
      id: firstId,
      transform: ({ content }) => `${content} first`,
    });
    registerPiContentTransformer(createPi(), {
      id: secondId,
      transform: ({ content }) => `${content} second`,
    });

    // Act
    const output = transformPiContent({ surface: 'systemPrompt', content: 'value' });

    // Assert
    expect(output).toBe('value first second');
  });

  it('removes a transformer before extension reload', () => {
    // Arrange
    const handlers: Array<(event: { reason: string }) => void> = [];
    const pi = {
      on: (event: string, handler: (event: { reason: string }) => void) => {
        if (event === 'session_shutdown') handlers.push(handler);
      },
    } as unknown as ExtensionAPI;
    registerPiContentTransformer(pi, {
      id: firstId,
      transform: ({ content }) => `${content} transformed`,
    });

    // Act
    handlers[0]?.({ reason: 'reload' });
    const output = transformPiContent({ surface: 'systemPrompt', content: 'value' });

    // Assert
    expect(output).toBe('value');
  });

  it('isolates transformer failures and reports them to the registration', () => {
    // Arrange
    const errors: unknown[] = [];
    registerPiContentTransformer(createPi(), {
      id: firstId,
      transform: () => {
        throw new Error('failed transform');
      },
      onError: (error) => errors.push(error),
    });

    // Act
    const output = transformPiContent({ surface: 'systemPrompt', content: 'value' });

    // Assert
    expect(output).toBe('value');
    expect(errors[0]).toEqual(new Error('failed transform'));
  });

  it('patches resource getters with resource metadata', () => {
    // Arrange
    const inputs: Array<{ surface: string; path?: string; workspaceCwd?: string; projectTrusted?: boolean }> = [];
    registerPiContentTransformer(createPi(), {
      id: firstId,
      transform: (input) => {
        inputs.push({
          surface: input.surface,
          path: input.path,
          workspaceCwd: input.workspaceCwd,
          projectTrusted: input.projectTrusted,
        });
        return `[${input.surface}]${input.content}`;
      },
    });
    const prototype = getFakeResourceLoaderPrototype();
    const resourceLoader = createFakeResourceLoader();

    // Act
    const systemPrompt = prototype.getSystemPrompt.call(resourceLoader);
    const agentsFiles = prototype.getAgentsFiles.call(resourceLoader).agentsFiles;

    // Assert
    expect(systemPrompt).toBe('[systemPrompt]system');
    expect(agentsFiles).toEqual([{ path: 'AGENTS.md', content: '[contextFile]agents' }]);
    expect(inputs).toContainEqual({
      surface: 'contextFile',
      path: 'AGENTS.md',
      workspaceCwd: '/workspace',
      projectTrusted: true,
    });
  });

  it('preserves resource collections when transforms do not change content', () => {
    // Arrange
    registerPiContentTransformer(createPi(), {
      id: firstId,
      transform: ({ content }) => content,
    });
    const prototype = getFakeResourceLoaderPrototype();
    const resourceLoader = createFakeResourceLoader();

    // Act
    const agentsFiles = prototype.getAgentsFiles.call(resourceLoader).agentsFiles;

    // Assert
    expect(agentsFiles).toBe(resourceLoader.agentsFiles);
  });

  it('preserves explicit skill invocation arguments', () => {
    // Arrange
    const originalText = '/skill:test argument {{value}}';
    const expandedText = '<skill>{{value}}</skill>\n\nargument {{value}}';

    // Act
    const output = transformExpandedSkillContent(originalText, expandedText, (input) =>
      input.content.replaceAll('{{value}}', 'rendered')
    );

    // Assert
    expect(output).toBe('<skill>rendered</skill>\n\nargument {{value}}');
  });

  it('patches the installed private skill expansion method', () => {
    // Arrange
    const directory = mkdtempSync(path.join(tmpdir(), 'pi-shared-skill-transform-'));
    const skillPath = path.join(directory, 'SKILL.md');
    writeFileSync(skillPath, '---\nname: test\ndescription: Test\n---\nBody {{value}}');
    registerPiContentTransformer(createPi(), {
      id: firstId,
      transform: ({ surface, content }) =>
        surface === 'skillInvocation' ? content.replaceAll('{{value}}', 'rendered') : content,
    });
    const prototype = AgentSession.prototype as unknown as {
      _expandSkillCommand(this: unknown, text: string): string;
    };
    const session = {
      resourceLoader: {
        getSkills: () => ({
          skills: [
            {
              name: 'test',
              description: 'Test',
              filePath: skillPath,
              baseDir: directory,
              sourceInfo: {},
              disableModelInvocation: false,
            },
          ],
          diagnostics: [],
        }),
      },
      _extensionRunner: { emitError: () => {} },
    };

    // Act
    const expanded = prototype._expandSkillCommand.call(session, '/skill:test argument {{value}}');

    // Assert
    expect(expanded).toContain('Body rendered');
    expect(expanded.endsWith('argument {{value}}')).toBe(true);
  });

  it('exposes one process-wide registry', () => {
    // Arrange
    const state = getPiContentTransformState();

    // Act
    const registry = state.transformers;

    // Assert
    expect(registry).toBeInstanceOf(Map);
  });
});
