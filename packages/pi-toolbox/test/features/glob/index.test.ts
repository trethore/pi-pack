import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Component } from '@earendil-works/pi-tui';
import { describe, expect, it, vi } from 'vitest';

import { createGlobToolDefinition, registerGlobTool } from '#pi-toolbox/features/glob/index.js';

const RENDER_WIDTH = 240;

describe('glob tool', () => {
  it('does not register when disabled', () => {
    // Arrange
    const pi = createPi();

    // Act
    registerGlobTool(pi.extensionApi, { glob: { enabled: false, defaultLimit: 100 } });

    // Assert
    expect(pi.tools).toEqual([]);
  });

  it('registers the glob tool when enabled', () => {
    // Arrange
    const pi = createPi();

    // Act
    registerGlobTool(pi.extensionApi, { glob: { enabled: true, defaultLimit: 100 } });

    // Assert
    expect(pi.tools.map((tool) => tool.name)).toEqual(['glob']);
  });

  it('marks zero-result glob calls as errors for shell rendering', () => {
    // Arrange
    const pi = createPi();
    registerGlobTool(pi.extensionApi, { glob: { enabled: true, defaultLimit: 100 } });

    // Act
    const result = pi.handlers.tool_result?.({
      toolName: 'glob',
      details: { paths: ['.'], count: 0, limited: false },
    });

    // Assert
    expect(result).toEqual({ isError: true });
  });

  it('defines limit and depth in the tool schema', () => {
    // Arrange and act
    const tool = createGlobToolDefinition({ enabled: true, defaultLimit: 42 });
    const properties = (
      tool.parameters as never as {
        properties: {
          limit: { description: string };
          depth: { minimum: number; description: string };
        };
      }
    ).properties;

    // Assert
    expect(properties.limit.description).toBe(
      'Maximum number of files to return. If omitted, the default limit is 42.'
    );
    expect(properties.depth).toEqual(
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
    const tool = createGlobToolDefinition({ enabled: true, defaultLimit: 42 }, { cwd, runner });

    // Act
    const result = await tool.execute(
      'call-id',
      { patterns: ['**/*.ts'], noIgnore: true, visibleOnly: true },
      undefined,
      undefined,
      {} as never
    );

    // Assert
    expect(runner).toHaveBeenCalledWith({
      cwd,
      patterns: ['**/*.ts'],
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

  it('deduplicates files returned through overlapping search paths in details', async () => {
    // Arrange
    const cwd = makeTempDir();
    mkdirSync(path.join(cwd, 'src'), { recursive: true });
    const runner = vi.fn(async () => ({
      files: ['src/index.ts', './src/index.ts', 'README.md'],
      limited: false,
    }));
    const tool = createGlobToolDefinition({ enabled: true, defaultLimit: 100 }, { cwd, runner });

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
    const tool = createGlobToolDefinition({ enabled: true, defaultLimit: 100 }, { cwd, runner });

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
packages/pi-toolbox/src/index.ts
[more files available]`,
    });
  });

  it('keeps absolute input paths in the result paths display', async () => {
    // Arrange
    const cwd = makeTempDir();
    const absoluteSearchPath = path.join(cwd, 'absolute-package');
    mkdirSync(absoluteSearchPath, { recursive: true });
    const runner = vi.fn(async () => ({ files: ['src/index.ts'], limited: false }));
    const tool = createGlobToolDefinition({ enabled: true, defaultLimit: 100 }, { cwd, runner });

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
    const tool = createGlobToolDefinition({ enabled: true, defaultLimit: 100 });

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
    expect(rendered).toContain(
      '<toolOutput> (limit 20, depth 2, noIgnore, visibleOnly)</toolOutput>'
    );
  });

  it('renders collapsed results with an expansion hint', () => {
    // Arrange
    const tool = createGlobToolDefinition({ enabled: true, defaultLimit: 100 });
    const output = Array.from({ length: 25 }, (_value, index) => `line ${index + 1}`).join('\n');

    // Act
    const rendered = renderComponent(
      tool.renderResult?.(
        {
          content: [{ type: 'text', text: output }],
          details: { paths: ['.'], count: 24, limited: false },
        },
        { expanded: false, isPartial: false },
        createTheme(),
        createRenderContext(false)
      )
    );

    // Assert
    expect(rendered).toContain('<toolOutput>line 1</toolOutput>');
    expect(rendered).toContain('<toolOutput>line 10</toolOutput>');
    expect(rendered).not.toContain('line 11');
    expect(rendered).toContain('15 more lines');
    expect(rendered).toContain('to expand');
  });

  it('renders expanded results with the full output returned to the model', () => {
    // Arrange
    const tool = createGlobToolDefinition({ enabled: true, defaultLimit: 100 });
    const output = ['paths=. count=2', 'src/', '  index.ts'].join('\n');

    // Act
    const rendered = renderComponent(
      tool.renderResult?.(
        {
          content: [{ type: 'text', text: output }],
          details: { paths: ['.'], count: 2, limited: false },
        },
        { expanded: true, isPartial: false },
        createTheme(),
        createRenderContext(false)
      )
    );

    // Assert
    expect(rendered).toContain('<toolOutput>paths=. count=2</toolOutput>');
    expect(rendered).toContain('<toolOutput>src/</toolOutput>');
    expect(rendered).toContain('<toolOutput>  index.ts</toolOutput>');
    expect(rendered).not.toContain('to expand');
  });

  it('renders zero-result and failed result text with the output style', () => {
    // Arrange
    const tool = createGlobToolDefinition({ enabled: true, defaultLimit: 100 });

    // Act
    const zeroResult = renderComponent(
      tool.renderResult?.(
        {
          content: [{ type: 'text', text: 'paths=. count=0' }],
          details: { paths: ['.'], count: 0, limited: false },
        },
        { expanded: false, isPartial: false },
        createTheme(),
        createRenderContext(false)
      )
    );
    const failedResult = renderComponent(
      tool.renderResult?.(
        {
          content: [{ type: 'text', text: 'glob failed: rg executable not found' }],
          details: undefined,
        },
        { expanded: false, isPartial: false },
        createTheme(),
        createRenderContext(true)
      )
    );

    // Assert
    expect(zeroResult).toContain('<toolOutput>paths=. count=0</toolOutput>');
    expect(failedResult).toContain('<toolOutput>glob failed: rg executable not found</toolOutput>');
  });

  it('fails when the search path is not a directory', async () => {
    // Arrange
    const cwd = makeTempDir();
    writeFileSync(path.join(cwd, 'file.txt'), 'content');
    const tool = createGlobToolDefinition({ enabled: true, defaultLimit: 100 }, { cwd });

    // Act and assert
    await expect(
      tool.execute(
        'call-id',
        { patterns: ['**/*.ts'], paths: ['file.txt'] },
        undefined,
        undefined,
        {} as never
      )
    ).rejects.toThrow('search path is not a directory');
  });
});

function renderComponent(component: Component | undefined): string {
  return component?.render(RENDER_WIDTH).join('\n') ?? '';
}

function createTheme() {
  return {
    bold: (value: string) => value,
    fg: (color: string, value: string) => `<${color}>${value}</${color}>`,
  } as never;
}

function createRenderContext(isError: boolean) {
  return {
    args: { patterns: ['**/*.ts'] },
    toolCallId: 'call-id',
    invalidate: () => {},
    lastComponent: undefined,
    state: {},
    cwd: process.cwd(),
    executionStarted: true,
    argsComplete: true,
    isPartial: false,
    expanded: false,
    showImages: false,
    isError,
  } as never;
}

function createPi() {
  const state = {
    tools: [] as { name: string }[],
    handlers: {} as Record<string, (event: unknown) => unknown>,
  };

  return {
    get tools() {
      return state.tools;
    },
    get handlers() {
      return state.handlers;
    },
    extensionApi: {
      registerTool(tool: { name: string }) {
        state.tools.push(tool);
      },
      on(event: string, handler: (event: unknown) => unknown) {
        state.handlers[event] = handler;
      },
    } as unknown as Parameters<typeof registerGlobTool>[0],
  };
}

function makeTempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'pi-toolbox-glob-test-'));
}
