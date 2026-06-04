import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '#src/config/schema.js';
import {
  createCommandTemplateRenderer,
  renderCommandTemplates,
} from '#src/core/render-template.js';

describe('renderCommandTemplates', () => {
  it('replaces configured template placeholders', () => {
    const output = renderCommandTemplates('OS={{osname}} branch={{ git-branch }}', {
      getOutput: (name) => ({ osname: 'Linux', 'git-branch': 'main' })[name],
    });

    expect(output).toBe('OS=Linux branch=main');
  });

  it('keeps unknown placeholders unchanged', () => {
    const output = renderCommandTemplates('value={{missing}}', {
      getOutput: () => {
        return;
      },
    });

    expect(output).toBe('value={{missing}}');
  });

  it('does not request command output when content has no template placeholders', () => {
    const output = renderCommandTemplates('plain prompt content', {
      getOutput: () => {
        throw new Error('unexpected command output request');
      },
    });

    expect(output).toBe('plain prompt content');
  });

  it('runs a template command once across repeated prompt renders', () => {
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

    const firstOutput = renderer.render('first {{counter}}', { surface: 'promptTemplates' });
    const secondOutput = renderer.render('second {{counter}}', { surface: 'promptTemplates' });

    expect(firstOutput).toBe('first run-1');
    expect(secondOutput).toBe('second run-1');
    expect(readFileSync(counterPath, 'utf8')).toBe('1');
  });
});
