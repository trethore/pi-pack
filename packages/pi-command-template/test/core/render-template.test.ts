import { describe, expect, it } from 'vitest';
import { renderCommandTemplates } from '#src/core/render-template.js';

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
});
