import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Component } from '@earendil-works/pi-tui';
import { describe, expect, it, vi } from 'vitest';

import { createGrepToolDefinition, registerGrepTool } from '#pi-toolbox/features/grep/index.js';

const DEFAULT_GREP_CONFIG = {
  enabled: true,
  defaultLimit: 200,
  defaultMaxCharsPerMatch: 200,
};
const RENDER_WIDTH = 240;

describe('grep tool', () => {
  it('does not register when disabled', () => {
    // Arrange
    const pi = createPi();

    // Act
    registerGrepTool(pi.extensionApi, { grep: { ...DEFAULT_GREP_CONFIG, enabled: false } });

    // Assert
    expect(pi.tools).toEqual([]);
  });

  it('registers the grep tool when enabled', () => {
    // Arrange
    const pi = createPi();

    // Act
    registerGrepTool(pi.extensionApi, { grep: DEFAULT_GREP_CONFIG });

    // Assert
    expect(pi.tools.map((tool) => tool.name)).toEqual(['grep']);
  });

  it('marks zero-result grep calls as errors for shell rendering', () => {
    // Arrange
    const pi = createPi();
    registerGrepTool(pi.extensionApi, { grep: DEFAULT_GREP_CONFIG });

    // Act
    const result = pi.handlers.tool_result?.({
      toolName: 'grep',
      details: { count: 0, files: 0, limited: false },
    });

    // Assert
    expect(result).toEqual({ isError: true });
  });

  it('injects configured defaults into the tool schema descriptions', () => {
    // Arrange and act
    const tool = createGrepToolDefinition({
      enabled: true,
      defaultLimit: 42,
      defaultLimitPerFile: 7,
      defaultMaxCharsPerMatch: 300,
    });
    const properties = (
      tool.parameters as never as {
        properties: {
          limit: { description: string };
          limitPerFile: { description: string };
          maxCharsPerMatch: { description: string };
        };
      }
    ).properties;

    // Assert
    expect(properties.limit.description).toBe(
      'Maximum number of matching lines to return globally. If omitted, defaults to 42.'
    );
    expect(properties.limitPerFile.description).toBe(
      'Maximum number of matching lines to return per file. If omitted, defaults to 7.'
    );
    expect(properties.maxCharsPerMatch.description).toBe(
      'Maximum number of characters to show per matching line. If omitted, defaults to 300.'
    );
  });

  it('injects no per-file limit into the schema description when no default is configured', () => {
    // Arrange and act
    const tool = createGrepToolDefinition(DEFAULT_GREP_CONFIG);
    const properties = (
      tool.parameters as never as {
        properties: { limitPerFile: { description: string } };
      }
    ).properties;

    // Assert
    expect(properties.limitPerFile.description).toBe(
      'Maximum number of matching lines to return per file. If omitted, defaults to no per-file limit.'
    );
  });

  it('uses config defaults and forwards flags to the runner', async () => {
    // Arrange
    const cwd = makeTempDir();
    const runner = vi.fn(async () => ({
      matches: [{ file: 'src/index.ts', line: 4, text: 'const needle = true;' }],
      limited: false,
    }));
    const tool = createGrepToolDefinition(
      { enabled: true, defaultLimit: 42, defaultLimitPerFile: 7, defaultMaxCharsPerMatch: 300 },
      { cwd, runner }
    );

    // Act
    const result = await tool.execute(
      'call-id',
      { regexes: ['needle'], noIgnore: true, visibleOnly: true },
      undefined,
      undefined,
      {} as never
    );

    // Assert
    expect(runner).toHaveBeenCalledWith({
      cwd,
      regexes: ['needle'],
      paths: ['.'],
      globs: [],
      limit: 42,
      limitPerFile: 7,
      maxCharsPerMatch: 300,
      noIgnore: true,
      visibleOnly: true,
      signal: undefined,
    });
    expect(result.details).toEqual({ count: 1, files: 1, limited: false });
    expect(result.content).toEqual([
      {
        type: 'text',
        text: `matches=1 files=1

src/index.ts
4: const needle = true;`,
      },
    ]);
  });

  it('uses the provided regexes, paths, globs, and explicit limits', async () => {
    // Arrange
    const cwd = makeTempDir();
    mkdirSync(path.join(cwd, 'src'), { recursive: true });
    mkdirSync(path.join(cwd, 'test'), { recursive: true });
    const runner = vi.fn(async () => ({ matches: [], limited: true }));
    const tool = createGrepToolDefinition(DEFAULT_GREP_CONFIG, { cwd, runner });

    // Act
    const result = await tool.execute(
      'call-id',
      {
        regexes: ['needle', 'haystack'],
        paths: ['src', 'test'],
        globs: ['*.ts', '!*.d.ts'],
        limit: 5,
        limitPerFile: 2,
        maxCharsPerMatch: 120,
      },
      undefined,
      undefined,
      {} as never
    );

    // Assert
    expect(runner).toHaveBeenCalledWith(
      expect.objectContaining({
        regexes: ['needle', 'haystack'],
        paths: ['src', 'test'],
        globs: ['*.ts', '!*.d.ts'],
        limit: 5,
        limitPerFile: 2,
        maxCharsPerMatch: 120,
      })
    );
    expect(result.details).toEqual({ count: 0, files: 0, limited: true });
    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'matches=0 files=0\n\n[more matches available]',
    });
  });

  it('accepts a file path', async () => {
    // Arrange
    const cwd = makeTempDir();
    writeFileSync(path.join(cwd, 'file.txt'), 'needle');
    const runner = vi.fn(async () => ({ matches: [], limited: false }));
    const tool = createGrepToolDefinition(DEFAULT_GREP_CONFIG, { cwd, runner });

    // Act
    await tool.execute(
      'call-id',
      { regexes: ['needle'], paths: ['file.txt'] },
      undefined,
      undefined,
      {} as never
    );

    // Assert
    expect(runner).toHaveBeenCalledWith(expect.objectContaining({ paths: ['file.txt'] }));
  });

  it('renders active call flags', () => {
    // Arrange
    const tool = createGrepToolDefinition(DEFAULT_GREP_CONFIG);

    // Act
    const rendered = renderComponent(
      tool.renderCall?.(
        {
          regexes: ['needle'],
          paths: ['src'],
          globs: ['*.ts'],
          limit: 20,
          limitPerFile: 2,
          maxCharsPerMatch: 120,
          noIgnore: true,
          visibleOnly: true,
        },
        createTheme(),
        createRenderContext(false)
      )
    );

    // Assert
    expect(rendered).toContain(
      '<toolOutput> (limit 20, limit/file 2, chars 120, globs *.ts, noIgnore, visibleOnly)</toolOutput>'
    );
  });

  it('renders collapsed results with an expansion hint', () => {
    // Arrange
    const tool = createGrepToolDefinition(DEFAULT_GREP_CONFIG);
    const output = Array.from({ length: 25 }, (_value, index) => `line ${index + 1}`).join('\n');

    // Act
    const rendered = renderComponent(
      tool.renderResult?.(
        {
          content: [{ type: 'text', text: output }],
          details: { count: 24, files: 2, limited: false },
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

  it('fails when the search path does not exist', async () => {
    // Arrange
    const cwd = makeTempDir();
    const tool = createGrepToolDefinition(DEFAULT_GREP_CONFIG, { cwd });

    // Act and assert
    await expect(
      tool.execute(
        'call-id',
        { regexes: ['needle'], paths: ['missing'] },
        undefined,
        undefined,
        {} as never
      )
    ).rejects.toThrow('search path does not exist');
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
    args: { regexes: ['needle'] },
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
    } as unknown as Parameters<typeof registerGrepTool>[0],
  };
}

function makeTempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'pi-toolbox-grep-test-'));
}
