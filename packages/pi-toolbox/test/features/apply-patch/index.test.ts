import { describe, expect, it, vi } from 'vitest';

import { ApplyPatchFailure } from '#pi-toolbox/features/apply-patch/apply.js';
import { createApplyPatchToolDefinition, registerApplyPatchTool } from '#pi-toolbox/features/apply-patch/index.js';
import { lines } from '#test/utils/lines.js';
import { createPi, createRenderContext, createTheme, renderComponent } from '#test/utils/tool-test-helpers.js';

const executeEmptyPatch = (tool: ReturnType<typeof createApplyPatchToolDefinition>) =>
  tool.execute(
    'call-id',
    { patch: lines('*** Begin Patch', '*** End Patch'), workdir: null },
    undefined,
    undefined,
    {} as never
  );

describe('apply_patch tool', () => {
  it('registers the apply_patch tool', () => {
    // Arrange
    const pi = createPi();

    // Act
    registerApplyPatchTool(pi.extensionApi);

    // Assert
    expect(pi.tools.map((tool) => tool.name)).toEqual(['apply_patch']);
  });

  it('defines a strict-compatible constrained sampling schema', () => {
    // Arrange and act
    const tool = createApplyPatchToolDefinition();
    const parameters = tool.parameters as never as {
      required: string[];
      properties: {
        patch: { type: string; description: string };
        workdir: { anyOf: Array<{ type: string }>; description: string };
      };
    };

    // Assert
    expect(tool.constrainedSampling).toEqual({ type: 'json_schema', strict: 'prefer' });
    expect(parameters.required).toEqual(['patch', 'workdir']);
    expect(parameters.properties.patch).toEqual(
      expect.objectContaining({
        type: 'string',
        description: 'Patch to apply.',
      })
    );
    expect(parameters.properties.workdir).toEqual({
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description:
        'Working directory for resolving relative paths in the patch. Set to null to use the current working directory.',
    });
  });

  it('joins multiline definition descriptions', () => {
    // Arrange and act
    const tool = createApplyPatchToolDefinition();

    // Assert
    expect(tool.description).toBe(
      lines(
        'Apply a patch using a simplified, file-oriented diff format.',
        'Patch must start with `*** Begin Patch` and end with `*** End Patch`. Supported hunks are `*** Add File:`, `*** Delete File:`, and `*** Update File:` with optional `*** Move to:`.',
        'Add hunks overwrite existing files, and move destinations are overwritten if they already exist.',
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
        text: lines('Patch applied:', 'A created.txt', 'M modified.txt', 'D deleted.txt'),
      },
    ]);
  });

  it('uses the execution context working directory', async () => {
    // Arrange
    const runner = vi.fn(async () => ({ added: [], modified: [], deleted: [] }));
    const tool = createApplyPatchToolDefinition({ runner });
    const patch = lines('*** Begin Patch', '*** Add File: created.txt', '+created', '*** End Patch');

    // Act
    await tool.execute('call-id', { patch, workdir: null }, undefined, undefined, { cwd: '/session/project' } as never);

    // Assert
    expect(runner).toHaveBeenCalledWith({ cwd: '/session/project', patch, workdir: undefined });
  });

  it('formats runner errors as patch failures', async () => {
    // Arrange
    const runner = vi.fn(async () => {
      throw new Error('boom');
    });
    const tool = createApplyPatchToolDefinition({ runner });

    // Act
    const operation = executeEmptyPatch(tool);

    // Assert
    await expect(operation).rejects.toThrow(lines('Patch failed:', 'boom'));
  });

  it('reports completed changes when the runner partially applies a patch', async () => {
    // Arrange
    const runner = vi.fn(async () => {
      throw new ApplyPatchFailure(
        { added: ['created.txt'], modified: [], deleted: [] },
        { type: 'delete', path: 'missing.txt' },
        new Error('Failed to delete file /workspace/missing.txt')
      );
    });
    const tool = createApplyPatchToolDefinition({ runner });

    // Act
    const operation = executeEmptyPatch(tool);

    // Assert
    await expect(operation).rejects.toThrow(
      lines(
        'Patch partially applied:',
        'A created.txt',
        '',
        'Failed to delete file missing.txt: Failed to delete file /workspace/missing.txt'
      )
    );
  });

  it('renders calls and results', async () => {
    // Arrange
    const runner = vi.fn(async () => ({ added: ['created.txt'], modified: [], deleted: [] }));
    const tool = createApplyPatchToolDefinition({ runner });
    const theme = createTheme();
    const renderContext = createRenderContext(false);
    const patch = lines('*** Begin Patch', '*** Add File: created.txt', '+created', '*** End Patch');

    // Act
    const callText = renderComponent(tool.renderCall?.({ patch, workdir: null }, theme, renderContext));
    const result = await tool.execute('call-id', { patch, workdir: null }, undefined, undefined, {} as never);
    const resultText = renderComponent(tool.renderResult?.(result, { expanded: true } as never, theme, renderContext));

    // Assert
    expect(callText).toContain('<toolTitle>apply_patch</toolTitle><toolOutput> in .</toolOutput>');
    expect(resultText).toContain('<toolOutput>Patch applied:</toolOutput>');
    expect(resultText).toContain('<toolOutput>A created.txt</toolOutput>');
  });

  it('renders tool errors unchanged', () => {
    // Arrange
    const tool = createApplyPatchToolDefinition();
    const theme = createTheme();
    const renderContext = createRenderContext(true);
    const errorResult = {
      content: [
        {
          type: 'text',
          text: lines(
            'Patch failed:',
            'Failed to update file file.txt: Failed to find expected lines in /workspace/file.txt'
          ),
        },
      ],
      details: {},
    } as never;

    // Act
    const resultText = renderComponent(
      tool.renderResult?.(errorResult, { expanded: false } as never, theme, renderContext)
    );

    // Assert
    expect(resultText).toContain('<toolOutput>Patch failed:</toolOutput>');
    expect(resultText).toContain(
      '<toolOutput>Failed to update file file.txt: Failed to find expected lines in /workspace/file.txt</toolOutput>'
    );
  });
});
