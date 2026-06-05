import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  applyCustomEdits,
  createCustomEditToolDefinition,
  executeReplaceAllEdit,
  registerCustomEditTool,
} from '#pi-toolbox/features/custom-edit/index.js';
import { createPi, makeTempDir as makePrefixedTempDir } from '#test/utils/tool-test-helpers.js';

const DEFAULT_CUSTOM_EDIT_CONFIG = { enabled: true };

describe('custom edit tool', () => {
  it('does not register when disabled', () => {
    // Arrange
    const pi = createPi();

    // Act
    registerCustomEditTool(pi.extensionApi, { customEdit: { enabled: false } });

    // Assert
    expect(pi.tools).toEqual([]);
  });

  it('registers as edit to override the built-in edit tool when enabled', () => {
    // Arrange
    const pi = createPi();

    // Act
    registerCustomEditTool(pi.extensionApi, { customEdit: DEFAULT_CUSTOM_EDIT_CONFIG });

    // Assert
    expect(pi.tools.map((tool) => tool.name)).toEqual(['edit']);
  });

  it('adds replaceAll to the edit schema', () => {
    // Arrange and act
    const tool = createCustomEditToolDefinition(DEFAULT_CUSTOM_EDIT_CONFIG);
    const parameters = tool.parameters as never as {
      properties: {
        edits: { items: { properties: { replaceAll: { type: string; description: string } } } };
      };
    };

    // Assert
    expect(parameters.properties.edits.items.properties.replaceAll).toEqual(
      expect.objectContaining({
        type: 'boolean',
        description:
          'Replace every exact non-overlapping occurrence of oldText. If omitted or false, oldText must match exactly one unique region.',
      })
    );
  });

  it('delegates to the built-in edit tool when replaceAll is not requested', async () => {
    // Arrange
    const execute = vi.fn(async () => ({ content: [{ type: 'text', text: 'delegated' }] }));
    const baseTool = createBaseTool({ execute });
    const tool = createCustomEditToolDefinition(DEFAULT_CUSTOM_EDIT_CONFIG, { baseTool });

    // Act
    const result = await tool.execute(
      'call-id',
      { path: 'file.ts', edits: [{ oldText: 'before', newText: 'after' }] },
      undefined,
      undefined,
      {} as never
    );

    // Assert
    expect(result.content).toEqual([{ type: 'text', text: 'delegated' }]);
    expect(execute).toHaveBeenCalledWith(
      'call-id',
      { path: 'file.ts', edits: [{ oldText: 'before', newText: 'after' }] },
      undefined,
      undefined,
      {}
    );
  });

  it('replaces all occurrences when replaceAll is true', async () => {
    // Arrange
    const cwd = makeTempDir();
    const filePath = path.join(cwd, 'edit.txt');
    writeFileSync(filePath, 'foo bar foo baz foo');
    const tool = createCustomEditToolDefinition(DEFAULT_CUSTOM_EDIT_CONFIG, { cwd });

    // Act
    const result = await tool.execute(
      'call-id',
      { path: filePath, edits: [{ oldText: 'foo', newText: 'qux', replaceAll: true }] },
      undefined,
      undefined,
      {} as never
    );

    // Assert
    expect(readFileSync(filePath, 'utf8')).toBe('qux bar qux baz qux');
    expect(result.content).toEqual([
      { type: 'text', text: `Successfully replaced 3 block(s) in ${filePath}.` },
    ]);
  });

  it('supports mixed unique and replaceAll edits matched against the original file', () => {
    // Arrange
    const originalContent = 'foo\nbar\nfoo\nbaz\n';

    // Act
    const result = applyCustomEdits(
      originalContent,
      [
        { oldText: 'foo\n', newText: 'FOO\n', replaceAll: true },
        { oldText: 'bar\n', newText: 'BAR\n' },
      ],
      'file.txt'
    );

    // Assert
    expect(result).toEqual({ newContent: 'FOO\nBAR\nFOO\nbaz\n', replacementCount: 3 });
  });

  it('preserves CRLF line endings and BOM when using replaceAll', async () => {
    // Arrange
    const cwd = makeTempDir();
    const filePath = path.join(cwd, 'edit.txt');
    writeFileSync(filePath, '\uFEFFfoo\r\nbar\r\nfoo\r\n');
    const tool = createCustomEditToolDefinition(DEFAULT_CUSTOM_EDIT_CONFIG, { cwd });

    // Act
    await tool.execute(
      'call-id',
      { path: filePath, edits: [{ oldText: 'foo\n', newText: 'FOO\n', replaceAll: true }] },
      undefined,
      undefined,
      {} as never
    );

    // Assert
    expect(readFileSync(filePath, 'utf8')).toBe('\uFEFFFOO\r\nbar\r\nFOO\r\n');
  });

  it('serializes replaceAll edits for the same file', async () => {
    // Arrange
    const cwd = makeTempDir();
    let fileContent = 'a a';
    const operations = {
      access: vi.fn(async () => {}),
      readFile: vi.fn(async () => Buffer.from(fileContent)),
      writeFile: vi.fn(async (_filePath: string, content: string) => {
        fileContent = content;
      }),
    };

    // Act
    await Promise.all([
      executeReplaceAllEdit(
        { path: 'edit.txt', edits: [{ oldText: 'a', newText: 'b', replaceAll: true }] },
        cwd,
        operations
      ),
      executeReplaceAllEdit(
        { path: 'edit.txt', edits: [{ oldText: 'b', newText: 'c', replaceAll: true }] },
        cwd,
        operations
      ),
    ]);

    // Assert
    expect(fileContent).toBe('c c');
  });

  it('keeps the existing duplicate error when replaceAll is omitted', () => {
    // Arrange, act, assert
    expect(() =>
      applyCustomEdits('foo foo foo', [{ oldText: 'foo', newText: 'bar' }], 'file.txt')
    ).toThrow('Found 3 occurrences of the text in file.txt');
  });

  it('fails when replaceAll finds no matches', () => {
    // Arrange, act, assert
    expect(() =>
      applyCustomEdits(
        'foo foo foo',
        [{ oldText: 'missing', newText: 'bar', replaceAll: true }],
        'file.txt'
      )
    ).toThrow('Could not find the exact text in file.txt');
  });

  it('fails when replaceAll edits overlap with another edit', () => {
    // Arrange, act, assert
    expect(() =>
      applyCustomEdits(
        'one two one two',
        [
          { oldText: 'one two', newText: 'ONE TWO', replaceAll: true },
          { oldText: 'two one', newText: 'TWO ONE' },
        ],
        'file.txt'
      )
    ).toThrow('overlap in file.txt');
  });
});

function makeTempDir(): string {
  return makePrefixedTempDir('pi-toolbox-custom-edit-test-');
}

function createBaseTool(options: { execute: ReturnType<typeof vi.fn> }) {
  return {
    name: 'edit',
    label: 'edit',
    description: 'base edit',
    promptGuidelines: [],
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              oldText: { type: 'string' },
              newText: { type: 'string' },
            },
          },
        },
      },
    },
    execute: options.execute,
  } as never;
}
