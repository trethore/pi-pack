import { describe, expect, it, vi } from 'vitest';

import { createApplyPatchToolDefinition, registerApplyPatchTool } from '#pi-toolbox/features/apply-patch/index.js';
import { lines } from '#test/utils/lines.js';
import { createPi, createRenderContext, createTheme, renderComponent } from '#test/utils/tool-test-helpers.js';

describe('apply_patch tool', () => {
  it('registers the apply_patch tool', () => {
    // Arrange
    const pi = createPi();

    // Act
    registerApplyPatchTool(pi.extensionApi);

    // Assert
    expect(pi.tools.map((tool) => tool.name)).toEqual(['apply_patch']);
  });

  it('defines patch as required and workdir as optional in the tool schema', () => {
    // Arrange and act
    const tool = createApplyPatchToolDefinition();
    const parameters = tool.parameters as never as {
      required: string[];
      properties: {
        patch: { type: string; description: string };
        workdir: { type: string; description: string };
      };
    };

    // Assert
    expect(parameters.required).toEqual(['patch']);
    expect(parameters.properties.patch).toEqual(
      expect.objectContaining({
        type: 'string',
        description: 'Patch to apply.',
      })
    );
    expect(parameters.properties.workdir.type).toBe('string');
  });

  it('joins multiline definition descriptions', () => {
    // Arrange and act
    const tool = createApplyPatchToolDefinition();

    // Assert
    expect(tool.description).toBe(
      lines(
        'Apply a patch using a simplified, file-oriented diff format.',
        'Patch must start with `*** Begin Patch` and end with `*** End Patch`. Supported hunks are `*** Add File:`, `*** Delete File:`, and `*** Update File:` with optional `*** Move to:`.',
        'Add targets and move destinations must not already exist.',
        'Automatically creates parent directories. Optionally, specify a working directory to resolve relative paths.'
      )
    );
  });

  it('calls the runner and formats the result', async () => {
    // Arrange
    const cwd = '/workspace';
    const runner = vi.fn(async () => ({
      added: ['created.txt'],
      modified: ['modified.txt'],
      deleted: ['deleted.txt'],
    }));
    const tool = createApplyPatchToolDefinition({ cwd, runner });
    const patch = lines('*** Begin Patch', '*** Add File: created.txt', '+created', '*** End Patch');

    // Act
    const result = await tool.execute(
      'call-id',
      { patch, workdir: '@packages/pi-toolbox' },
      undefined,
      undefined,
      {} as never
    );

    // Assert
    expect(runner).toHaveBeenCalledWith({ cwd, patch, workdir: 'packages/pi-toolbox' });
    expect(result.details).toEqual({
      added: ['created.txt'],
      modified: ['modified.txt'],
      deleted: ['deleted.txt'],
      count: 3,
    });
    expect(result.content).toEqual([
      {
        type: 'text',
        text: 'Success.',
      },
    ]);
  });

  it('uses the execution context working directory', async () => {
    // Arrange
    const runner = vi.fn(async () => ({ added: [], modified: [], deleted: [] }));
    const tool = createApplyPatchToolDefinition({ runner });
    const patch = lines('*** Begin Patch', '*** Add File: created.txt', '+created', '*** End Patch');

    // Act
    await tool.execute('call-id', { patch }, undefined, undefined, { cwd: '/session/project' } as never);

    // Assert
    expect(runner).toHaveBeenCalledWith({ cwd: '/session/project', patch, workdir: undefined });
  });

  it('wraps runner errors with the tool name', async () => {
    // Arrange
    const runner = vi.fn(async () => {
      throw new Error('boom');
    });
    const tool = createApplyPatchToolDefinition({ runner });

    // Act and assert
    await expect(
      tool.execute('call-id', { patch: lines('*** Begin Patch', '*** End Patch') }, undefined, undefined, {} as never)
    ).rejects.toThrow('apply_patch failed: boom');
  });

  it('renders calls and results', async () => {
    // Arrange
    const runner = vi.fn(async () => ({ added: ['created.txt'], modified: [], deleted: [] }));
    const tool = createApplyPatchToolDefinition({ runner });
    const theme = createTheme();
    const renderContext = createRenderContext(false);
    const patch = lines('*** Begin Patch', '*** Add File: created.txt', '+created', '*** End Patch');

    // Act
    const callText = renderComponent(tool.renderCall?.({ patch }, theme, renderContext));
    const result = await tool.execute('call-id', { patch }, undefined, undefined, {} as never);
    const resultText = renderComponent(tool.renderResult?.(result, { expanded: true } as never, theme, renderContext));

    // Assert
    expect(callText).toContain('<toolTitle>apply_patch</toolTitle><toolOutput> in .</toolOutput>');
    expect(resultText).toContain('<toolOutput>Success. Updated the following files:</toolOutput>');
    expect(resultText).toContain('<toolOutput>A created.txt</toolOutput>');
  });
});
