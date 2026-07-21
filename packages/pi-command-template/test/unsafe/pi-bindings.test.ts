import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AgentSession, DefaultResourceLoader } from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it } from 'vitest';
import { checkUnsafeCompatibility } from '#src/unsafe/compatibility.js';
import { disableUnsafePiCommandTemplatePatch, installUnsafePiCommandTemplatePatch } from '#src/unsafe/index.js';

const resourceLoaderId = 'test:resource-loader-bindings';
const agentSessionId = 'test:agent-session-binding';

describe('Pi unsafe bindings', () => {
  afterEach(() => {
    disableUnsafePiCommandTemplatePatch(resourceLoaderId);
    disableUnsafePiCommandTemplatePatch(agentSessionId);
  });

  it('recognizes the installed Pi version and required classes', () => {
    expect(checkUnsafeCompatibility()).toEqual({ warnings: [], errors: [] });
  });

  it('patches the installed DefaultResourceLoader method shapes', () => {
    // Arrange
    installUnsafePiCommandTemplatePatch(resourceLoaderId, ({ surface, content }) => `[${surface}]${content}`);
    const prototype = DefaultResourceLoader.prototype as unknown as {
      getSystemPrompt(this: { systemPrompt: string }): string;
      getAppendSystemPrompt(this: { appendSystemPrompt: string[] }): string[];
      getAgentsFiles(this: { agentsFiles: Array<{ path: string; content: string }> }): {
        agentsFiles: Array<{ path: string; content: string }>;
      };
    };

    // Act
    const systemPrompt = prototype.getSystemPrompt.call({ systemPrompt: 'system' });
    const appendSystemPrompt = prototype.getAppendSystemPrompt.call({ appendSystemPrompt: ['append'] });
    const agentsFiles = prototype.getAgentsFiles.call({
      agentsFiles: [{ path: 'AGENTS.md', content: 'agents' }],
    }).agentsFiles;

    // Assert
    expect(systemPrompt).toBe('[system]system');
    expect(appendSystemPrompt).toEqual(['[appendSystem]append']);
    expect(agentsFiles).toEqual([{ path: 'AGENTS.md', content: '[contextFiles]agents' }]);
  });

  it('patches the installed private skill expansion method without transforming arguments', () => {
    // Arrange
    const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'pi-command-template-skill-'));
    const skillPath = path.join(temporaryDirectory, 'SKILL.md');
    writeFileSync(skillPath, '---\nname: test\ndescription: Test\n---\nBody {{value}}');
    installUnsafePiCommandTemplatePatch(agentSessionId, ({ surface, content }) =>
      surface === 'skillInvocation' ? content.replaceAll('{{value}}', 'rendered') : content
    );

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
              baseDir: temporaryDirectory,
              sourceInfo: {},
              disableModelInvocation: false,
            },
          ],
          diagnostics: [],
        }),
      },
      _extensionRunner: { emitError: () => null },
    };

    // Act
    const expanded = prototype._expandSkillCommand.call(session, '/skill:test argument {{value}}');

    // Assert
    expect(expanded).toContain('Body rendered');
    expect(expanded.endsWith('argument {{value}}')).toBe(true);
  });
});
