import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createGrepToolDefinition, registerGrepTool } from '#pi-toolbox/features/grep/index.js';
import {
  createPi,
  createLineOutput,
  createRenderContext,
  createTheme,
  expectPersistedTruncatedResult,
  expectSummaryOnlyCollapsedOutputWithExpansionHint,
  makeTempDir as makePrefixedTempDir,
  renderComponent,
  renderToolResult,
} from '#test/utils/tool-test-helpers.js';

const DEFAULT_GREP_CONFIG = {
  enabled: true,
  defaultLimit: 200,
  defaultMaxCharsPerMatch: 200,
};

describe('grep tool', () => {
  it('registers the grep tool', () => {
    // Arrange
    const pi = createPi();

    // Act
    registerGrepTool(pi.extensionApi, DEFAULT_GREP_CONFIG);

    // Assert
    expect(pi.tools.map((tool) => tool.name)).toEqual(['grep']);
  });

  it('injects configured defaults and defines depth in the tool schema', () => {
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
          depth: { minimum: number; description: string };
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
    expect(properties.depth).toEqual(
      expect.objectContaining({
        minimum: 1,
        description:
          'Maximum directory traversal depth relative to each search path. If provided, passes `--max-depth <depth>`. If omitted, traversal is unlimited.',
      })
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
      depth: undefined,
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

  it('normalizes blank optional lists to fallback values at the tool boundary', async () => {
    // Arrange
    const { runner, tool } = createEmptyGrepTool();

    // Act
    await tool.execute(
      'call-id',
      { regexes: ['needle'], paths: [' '], globs: [' '] },
      undefined,
      undefined,
      {} as never
    );

    // Assert
    expect(runner).toHaveBeenCalledWith(expect.objectContaining({ paths: ['.'], globs: [] }));
  });

  it('uses ctx.cwd and strips a leading at-sign from search paths', async () => {
    // Arrange
    const cwd = makeTempDir();
    mkdirSync(path.join(cwd, 'src'));
    const runner = vi.fn(async () => ({ matches: [], limited: false }));
    const tool = createGrepToolDefinition(DEFAULT_GREP_CONFIG, { runner });

    // Act
    await tool.execute('call-id', { regexes: ['needle'], paths: ['@src'] }, undefined, undefined, { cwd } as never);

    // Assert
    expect(runner).toHaveBeenCalledWith(expect.objectContaining({ cwd, paths: ['src'] }));
  });

  it('fails when regexes only contain blank values', async () => {
    // Arrange
    const { runner, tool } = createEmptyGrepTool();

    // Act
    const operation = tool.execute('call-id', { regexes: [' ', ''] }, undefined, undefined, {} as never);

    // Assert
    await expect(operation).rejects.toThrow('grep failed: regexes must contain at least one non-empty string');
    expect(runner).not.toHaveBeenCalled();
  });

  it('uses the provided regexes, paths, globs, explicit limits, and depth', async () => {
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
        depth: 2,
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
        depth: 2,
        maxCharsPerMatch: 120,
      })
    );
    expect(result.details).toEqual({ count: 0, files: 0, limited: true });
    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'matches=0 files=0\n[more matches available]',
    });
  });

  it('accepts a file path', async () => {
    // Arrange
    const { cwd, runner, tool } = createEmptyGrepTool();
    writeFileSync(path.join(cwd, 'file.txt'), 'needle');

    // Act
    await tool.execute('call-id', { regexes: ['needle'], paths: ['file.txt'] }, undefined, undefined, {} as never);

    // Assert
    expect(runner).toHaveBeenCalledWith(expect.objectContaining({ paths: ['file.txt'] }));
  });

  it('fills the global display limit when per-file limit sentinels are present', async () => {
    // Arrange
    const cwd = makeTempDir();
    writeFileSync(path.join(cwd, 'a.txt'), 'needle a1\nneedle a2\n');
    writeFileSync(path.join(cwd, 'b.txt'), 'needle b1\nneedle b2\n');
    writeFileSync(path.join(cwd, 'c.txt'), 'needle c1\nneedle c2\n');
    const tool = createGrepToolDefinition(DEFAULT_GREP_CONFIG, { cwd });

    // Act
    const result = await tool.execute(
      'call-id',
      { regexes: ['needle'], paths: ['.'], limit: 3, limitPerFile: 1 },
      undefined,
      undefined,
      {} as never
    );

    // Assert
    const output = result.content[0];

    expect(result.details).toEqual({ count: 3, files: 3, limited: false });
    expect(output?.type).toBe('text');
    if (output?.type !== 'text') throw new Error('expected text output');
    expect(output.text).toContain('matches=3 files=3');
    expect(output.text).toContain('a.txt\n1: needle a1');
    expect(output.text).toContain('b.txt\n1: needle b1');
    expect(output.text).toContain('c.txt\n1: needle c1');
    expect(output.text).toContain('[more matches in this file]');
    expect(output.text).not.toContain('[more matches available]');
  });

  it('keeps formatted results within the default Pi output limits', async () => {
    // Arrange
    const cwd = makeTempDir();
    const matches = Array.from({ length: 1000 }, (_value, index) => ({
      file: `file-${index}.txt`,
      line: index + 1,
      text: 'x'.repeat(100),
    }));
    const runner = vi.fn(async () => ({ matches, limited: false }));
    const tool = createGrepToolDefinition(
      { enabled: true, defaultLimit: 1000, defaultMaxCharsPerMatch: 200 },
      { cwd, runner }
    );

    // Act
    const result = await tool.execute('call-id', { regexes: ['x'] }, undefined, undefined, {} as never);

    // Assert
    const fullOutputPath = expectPersistedTruncatedResult(result, {
      truncatedBy: 'bytes',
      fullOutputIncludes: ['matches=1000 files=1000', 'file-999.txt\n1000:'],
    });

    const rendered = renderToolResult(tool.renderResult, result, { expanded: false, isPartial: false });
    expect(rendered).toContain(`Full output: ${fullOutputPath}`);
    expect(rendered).toContain('Truncated:');
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
          depth: 2,
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
      '<toolOutput> (limit 20, limit/file 2, depth 2, chars 120, globs [*.ts], noIgnore, visibleOnly)</toolOutput>'
    );
  });

  it('shows only the summary for collapsed results and renders an expansion hint', () => {
    // Arrange
    const tool = createGrepToolDefinition(DEFAULT_GREP_CONFIG);
    const output = createLineOutput(25);

    // Act
    const rendered = renderToolResult(
      tool.renderResult,
      {
        content: [{ type: 'text', text: output }],
        details: { count: 24, files: 2, limited: false },
      },
      { expanded: false, isPartial: false }
    );

    // Assert
    expectSummaryOnlyCollapsedOutputWithExpansionHint(rendered, 25);
  });

  it('fails when the search path does not exist', async () => {
    // Arrange
    const cwd = makeTempDir();
    const tool = createGrepToolDefinition(DEFAULT_GREP_CONFIG, { cwd });

    // Act
    const operation = tool.execute(
      'call-id',
      { regexes: ['needle'], paths: ['missing'] },
      undefined,
      undefined,
      {} as never
    );

    // Assert
    await expect(operation).rejects.toThrow('search path does not exist');
  });
});

function makeTempDir(): string {
  return makePrefixedTempDir('pi-toolbox-grep-test-');
}

function createEmptyGrepTool() {
  const cwd = makeTempDir();
  const runner = vi.fn(async () => ({ matches: [], limited: false }));
  const tool = createGrepToolDefinition(DEFAULT_GREP_CONFIG, { cwd, runner });
  return { cwd, runner, tool };
}
