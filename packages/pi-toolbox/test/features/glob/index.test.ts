import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Component } from '@earendil-works/pi-tui';
import { describe, expect, it, vi } from 'vitest';

import { createGlobToolDefinition, registerGlobTool } from '#pi-toolbox/features/glob/index.js';

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

  it('injects the configured default limit into the tool schema description', () => {
    // Arrange and act
    const tool = createGlobToolDefinition({ enabled: true, defaultLimit: 42 });

    // Assert
    expect(
      (tool.parameters as never as { properties: { limit: { description: string } } }).properties
        .limit.description
    ).toBe('Maximum number of files to return. If omitted, defaults to 42.');
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
      { pattern: '**/*.ts', noIgnore: true, hidden: true },
      undefined,
      undefined,
      {} as never
    );

    // Assert
    expect(runner).toHaveBeenCalledWith({
      basePath: cwd,
      pattern: '**/*.ts',
      limit: 42,
      noIgnore: true,
      hidden: true,
      signal: undefined,
    });
    expect(result.details).toEqual({ base: '.', count: 1, limited: false });
    expect(result.content).toEqual([
      {
        type: 'text',
        text: `base=. count=1
src/
  index.ts`,
      },
    ]);
  });

  it('uses the provided path and limit', async () => {
    // Arrange
    const cwd = makeTempDir();
    mkdirSync(path.join(cwd, 'packages', 'pi-toolbox'), { recursive: true });
    const runner = vi.fn(async () => ({ files: ['src/index.ts'], limited: true }));
    const tool = createGlobToolDefinition({ enabled: true, defaultLimit: 100 }, { cwd, runner });

    // Act
    const result = await tool.execute(
      'call-id',
      { pattern: '**/*.ts', path: 'packages/pi-toolbox', limit: 5 },
      undefined,
      undefined,
      {} as never
    );

    // Assert
    expect(runner).toHaveBeenCalledWith(
      expect.objectContaining({
        basePath: path.join(cwd, 'packages', 'pi-toolbox'),
        limit: 5,
      })
    );
    expect(result.details).toEqual({ base: 'packages/pi-toolbox', count: 1, limited: true });
    expect(result.content[0]).toEqual({
      type: 'text',
      text: `base=packages/pi-toolbox count=1 limited=true
src/
  index.ts`,
    });
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
          details: { base: '.', count: 24, limited: false },
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
    const output = ['base=. count=2', 'src/', '  index.ts'].join('\n');

    // Act
    const rendered = renderComponent(
      tool.renderResult?.(
        {
          content: [{ type: 'text', text: output }],
          details: { base: '.', count: 2, limited: false },
        },
        { expanded: true, isPartial: false },
        createTheme(),
        createRenderContext(false)
      )
    );

    // Assert
    expect(rendered).toContain('<toolOutput>base=. count=2</toolOutput>');
    expect(rendered).toContain('<toolOutput>src/</toolOutput>');
    expect(rendered).toContain('<toolOutput>  index.ts</toolOutput>');
    expect(rendered).not.toContain('to expand');
  });

  it('renders zero-result and failed results with the error style', () => {
    // Arrange
    const tool = createGlobToolDefinition({ enabled: true, defaultLimit: 100 });

    // Act
    const zeroResult = renderComponent(
      tool.renderResult?.(
        {
          content: [{ type: 'text', text: 'base=. count=0' }],
          details: { base: '.', count: 0, limited: false },
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
    expect(zeroResult).toContain('<error>base=. count=0</error>');
    expect(failedResult).toContain('<error>glob failed: rg executable not found</error>');
  });

  it('fails when the base path is not a directory', async () => {
    // Arrange
    const cwd = makeTempDir();
    writeFileSync(path.join(cwd, 'file.txt'), 'content');
    const tool = createGlobToolDefinition({ enabled: true, defaultLimit: 100 }, { cwd });

    // Act and assert
    await expect(
      tool.execute(
        'call-id',
        { pattern: '**/*.ts', path: 'file.txt' },
        undefined,
        undefined,
        {} as never
      )
    ).rejects.toThrow('base path is not a directory');
  });
});

function renderComponent(component: Component | undefined): string {
  return component?.render(120).join('\n') ?? '';
}

function createTheme() {
  return {
    bold: (value: string) => value,
    fg: (color: string, value: string) => `<${color}>${value}</${color}>`,
  } as never;
}

function createRenderContext(isError: boolean) {
  return {
    args: { pattern: '**/*.ts' },
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
  };

  return {
    get tools() {
      return state.tools;
    },
    extensionApi: {
      registerTool(tool: { name: string }) {
        state.tools.push(tool);
      },
    } as unknown as Parameters<typeof registerGlobTool>[0],
  };
}

function makeTempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'pi-toolbox-glob-test-'));
}
