import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createFindFilesToolDefinition, registerFindFilesTool } from '#pi-toolbox/features/find-files/index.js';

import {
  createPi,
  createLineOutput,
  createRenderContext,
  createTheme,
  expectCollapsedOutputWithExpansionHint,
  makeTempDir as makePrefixedTempDir,
  renderComponent,
  renderToolResult,
} from '#test/utils/tool-test-helpers.js';

describe('find_files tool', () => {
  it('does not register when disabled', () => {
    // Arrange
    const pi = createPi();

    // Act
    registerFindFilesTool(pi.extensionApi, { findFiles: { enabled: false, defaultLimit: 100 } });

    // Assert
    expect(pi.tools).toEqual([]);
  });

  it('registers the find_files tool when enabled', () => {
    // Arrange
    const pi = createPi();

    // Act
    registerFindFilesTool(pi.extensionApi, { findFiles: { enabled: true, defaultLimit: 100 } });

    // Assert
    expect(pi.tools.map((tool) => tool.name)).toEqual(['find_files']);
  });

  it('defines optional patterns, limit, and depth in the tool schema', () => {
    // Arrange and act
    const tool = createFindFilesToolDefinition({ enabled: true, defaultLimit: 42 });
    const parameters = tool.parameters as never as {
      required?: string[];
      properties: {
        patterns: { description: string };
        limit: { description: string };
        depth: { minimum: number; description: string };
      };
    };

    // Assert
    expect(parameters.required).toBeUndefined();
    expect(parameters.properties.patterns.description).toBe(
      'Optional ripgrep-style glob filter(s) passed with `-g`. Prefix with `!` to exclude. If omitted, all discovered files are returned.'
    );
    expect(parameters.properties.limit.description).toBe(
      'Maximum number of files to return. If omitted, the default limit is 42.'
    );
    expect(parameters.properties.depth).toEqual(
      expect.objectContaining({
        minimum: 1,
        description:
          'Maximum directory traversal depth relative to each search path. If provided, passes `--max-depth <depth>`. If omitted, traversal is unlimited.',
      })
    );
  });

  it('uses config defaults and forwards flags to the runner', async () => {
    // Arrange
    const cwd = makeTempDir();
    const runner = vi.fn(async () => ({
      files: ['src/index.ts'],
      limited: false,
    }));
    const tool = createFindFilesToolDefinition({ enabled: true, defaultLimit: 42 }, { cwd, runner });

    // Act
    const result = await tool.execute(
      'call-id',
      { noIgnore: true, visibleOnly: true },
      undefined,
      undefined,
      {} as never
    );

    // Assert
    expect(runner).toHaveBeenCalledWith({
      cwd,
      patterns: [],
      paths: ['.'],
      limit: 42,
      depth: undefined,
      noIgnore: true,
      visibleOnly: true,
      signal: undefined,
    });
    expect(result.details).toEqual({ paths: ['.'], count: 1, limited: false });
    expect(result.content).toEqual([
      {
        type: 'text',
        text: `found=1
src/index.ts`,
      },
    ]);
  });

  it('normalizes blank optional lists to fallback values at the tool boundary', async () => {
    // Arrange
    const cwd = makeTempDir();
    const runner = vi.fn(async () => ({ files: [], limited: false }));
    const tool = createFindFilesToolDefinition({ enabled: true, defaultLimit: 100 }, { cwd, runner });

    // Act
    await tool.execute('call-id', { patterns: [' ', ''], paths: [' '] }, undefined, undefined, {} as never);

    // Assert
    expect(runner).toHaveBeenCalledWith(expect.objectContaining({ patterns: [], paths: ['.'] }));
  });

  it('deduplicates files returned through overlapping search paths in details', async () => {
    // Arrange
    const cwd = makeTempDir();
    mkdirSync(path.join(cwd, 'src'), { recursive: true });
    const runner = vi.fn(async () => ({
      files: ['src/index.ts', './src/index.ts', 'README.md'],
      limited: false,
    }));
    const tool = createFindFilesToolDefinition({ enabled: true, defaultLimit: 100 }, { cwd, runner });

    // Act
    const result = await tool.execute(
      'call-id',
      { patterns: ['**/*'], paths: ['.', 'src'] },
      undefined,
      undefined,
      {} as never
    );

    // Assert
    expect(result.details).toEqual({ paths: ['.', 'src'], count: 2, limited: false });
    expect(result.content[0]).toEqual({
      type: 'text',
      text: `found=2
README.md
src/index.ts`,
    });
  });

  it('uses the provided patterns, paths, limit, and depth', async () => {
    // Arrange
    const cwd = makeTempDir();
    mkdirSync(path.join(cwd, 'packages', 'pi-toolbox'), { recursive: true });
    mkdirSync(path.join(cwd, 'scripts'), { recursive: true });
    const runner = vi.fn(async () => ({
      files: ['packages/pi-toolbox/src/index.ts'],
      limited: true,
    }));
    const tool = createFindFilesToolDefinition({ enabled: true, defaultLimit: 100 }, { cwd, runner });

    // Act
    const result = await tool.execute(
      'call-id',
      {
        patterns: ['**/*.ts', '!**/*.d.ts'],
        paths: ['packages/pi-toolbox', 'scripts'],
        limit: 5,
        depth: 2,
      },
      undefined,
      undefined,
      {} as never
    );

    // Assert
    expect(runner).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd,
        patterns: ['**/*.ts', '!**/*.d.ts'],
        paths: ['packages/pi-toolbox', 'scripts'],
        limit: 5,
        depth: 2,
      })
    );
    expect(result.details).toEqual({
      paths: ['packages/pi-toolbox', 'scripts'],
      count: 1,
      limited: true,
    });
    expect(result.content[0]).toEqual({
      type: 'text',
      text: `found=1
pi-toolbox/src/index.ts
[more files available]`,
    });
  });

  it('keeps absolute input paths in the result paths display', async () => {
    // Arrange
    const cwd = makeTempDir();
    const absoluteSearchPath = path.join(cwd, 'absolute-package');
    mkdirSync(absoluteSearchPath, { recursive: true });
    const runner = vi.fn(async () => ({ files: ['src/index.ts'], limited: false }));
    const tool = createFindFilesToolDefinition({ enabled: true, defaultLimit: 100 }, { cwd, runner });

    // Act
    const result = await tool.execute(
      'call-id',
      { patterns: ['**/*.ts'], paths: [absoluteSearchPath] },
      undefined,
      undefined,
      {} as never
    );

    // Assert
    expect(result.details).toEqual({ paths: [absoluteSearchPath], count: 1, limited: false });
    expect(result.content[0]).toEqual({
      type: 'text',
      text: `found=1
src/index.ts`,
    });
  });

  it('renders active call flags', () => {
    // Arrange
    const tool = createFindFilesToolDefinition({ enabled: true, defaultLimit: 100 });

    // Act
    const rendered = renderComponent(
      tool.renderCall?.(
        {
          patterns: ['*.ts'],
          paths: ['src'],
          limit: 20,
          depth: 2,
          noIgnore: true,
          visibleOnly: true,
        },
        createTheme(),
        createRenderContext(false)
      )
    );

    // Assert
    expect(rendered).toContain('<toolOutput> (limit 20, depth 2, noIgnore, visibleOnly)</toolOutput>');
  });

  it('renders collapsed results with an expansion hint', () => {
    // Arrange
    const tool = createFindFilesToolDefinition({ enabled: true, defaultLimit: 100 });
    const output = createLineOutput(25);

    // Act
    const rendered = renderToolResult(
      tool.renderResult,
      {
        content: [{ type: 'text', text: output }],
        details: { paths: ['.'], count: 24, limited: false },
      },
      { expanded: false, isPartial: false }
    );

    // Assert
    expectCollapsedOutputWithExpansionHint(rendered);
  });

  it('renders expanded results with the full output returned to the model', () => {
    // Arrange
    const tool = createFindFilesToolDefinition({ enabled: true, defaultLimit: 100 });
    const output = ['paths=. count=2', 'src/', '  index.ts'].join('\n');

    // Act
    const rendered = renderToolResult(
      tool.renderResult,
      {
        content: [{ type: 'text', text: output }],
        details: { paths: ['.'], count: 2, limited: false },
      },
      { expanded: true, isPartial: false }
    );

    // Assert
    expect(rendered).toContain('<toolOutput>paths=. count=2</toolOutput>');
    expect(rendered).toContain('<toolOutput>src/</toolOutput>');
    expect(rendered).toContain('<toolOutput>  index.ts</toolOutput>');
    expect(rendered).not.toContain('to expand');
  });

  it('renders zero-result and failed result text with the output style', () => {
    // Arrange
    const tool = createFindFilesToolDefinition({ enabled: true, defaultLimit: 100 });

    // Act
    const zeroResult = renderToolResult(
      tool.renderResult,
      {
        content: [{ type: 'text', text: 'paths=. count=0' }],
        details: { paths: ['.'], count: 0, limited: false },
      },
      { expanded: false, isPartial: false }
    );
    const failedResult = renderToolResult(
      tool.renderResult,
      {
        content: [{ type: 'text', text: 'find_files failed: rg executable not found' }],
        details: undefined,
      },
      { expanded: false, isPartial: false },
      true
    );

    // Assert
    expect(zeroResult).toContain('<toolOutput>paths=. count=0</toolOutput>');
    expect(failedResult).toContain('<toolOutput>find_files failed: rg executable not found</toolOutput>');
  });

  it('fails when the search path is not a directory', async () => {
    // Arrange
    const cwd = makeTempDir();
    writeFileSync(path.join(cwd, 'file.txt'), 'content');
    const tool = createFindFilesToolDefinition({ enabled: true, defaultLimit: 100 }, { cwd });

    // Act and assert
    await expect(
      tool.execute('call-id', { patterns: ['**/*.ts'], paths: ['file.txt'] }, undefined, undefined, {} as never)
    ).rejects.toThrow('search path is not a directory');
  });
});

function makeTempDir(): string {
  return makePrefixedTempDir('pi-toolbox-find-files-test-');
}
