import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '#src/config/schema.js';
import { createCommandTemplateRenderer, renderCommandTemplates } from '#src/core/render-template.js';

function getNoOutput(): undefined {}

function failUnexpectedOutputRequest(): never {
  throw new Error('unexpected command output request');
}

describe('renderCommandTemplates', () => {
  it('replaces configured template placeholders', () => {
    // Arrange
    const outputs: Record<string, string> = { osname: 'Linux', 'git-branch': 'main' };
    const getOutput = (name: string) => outputs[name];

    // Act
    const output = renderCommandTemplates('OS={{osname}} branch={{ git-branch }}', { getOutput });

    // Assert
    expect(output).toBe('OS=Linux branch=main');
  });

  it('keeps unknown placeholders unchanged', () => {
    // Arrange
    const content = 'value={{missing}}';

    // Act
    const output = renderCommandTemplates(content, { getOutput: getNoOutput });

    // Assert
    expect(output).toBe('value={{missing}}');
  });

  it('does not request command output when content has no template placeholders', () => {
    // Arrange
    const content = 'plain prompt content';

    // Act
    const output = renderCommandTemplates(content, { getOutput: failUnexpectedOutputRequest });

    // Assert
    expect(output).toBe('plain prompt content');
  });

  it('runs a template command once across repeated prompt renders', () => {
    // Arrange
    const workspace = mkdtempSync(path.join(tmpdir(), 'pi-command-template-render-'));
    const counterPath = path.join(workspace, 'counter.txt');
    writeFileSync(counterPath, '0');
    const renderer = createCommandTemplateRenderer({
      config: {
        ...defaultConfig,
        execution: { ...defaultConfig.execution, shell: false },
        templates: {
          counter: [
            'node',
            '-e',
            'const fs = require("node:fs"); const file = process.argv[1]; const next = Number(fs.readFileSync(file, "utf8")) + 1; fs.writeFileSync(file, String(next)); process.stdout.write(`run-${next}`);',
            counterPath,
          ],
        },
      },
      workspaceCwd: workspace,
      extensionCwd: process.cwd(),
    });

    // Act
    const firstOutput = renderer.render('first {{counter}}', { surface: 'promptTemplates' });
    const secondOutput = renderer.render('second {{counter}}', { surface: 'promptTemplates' });

    // Assert
    expect(firstOutput).toBe('first run-1');
    expect(secondOutput).toBe('second run-1');
    expect(readFileSync(counterPath, 'utf8')).toBe('1');
  });
});
