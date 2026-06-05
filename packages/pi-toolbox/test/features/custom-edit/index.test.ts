import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { Text } from '@earendil-works/pi-tui';
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

  it('keeps the original edit prompting with replaceAll additions', () => {
    // Arrange and act
    const tool = createCustomEditToolDefinition(DEFAULT_CUSTOM_EDIT_CONFIG);

    // Assert
    expect(tool.description).toContain('Every edits[].oldText must match a unique');
    expect(tool.description).toContain('unless edits[].replaceAll is true');
    expect(tool.promptGuidelines).toEqual([
      'Use edit for precise changes (edits[].oldText must match exactly)',
      'When changing multiple separate locations in one file, use one edit call with multiple entries in edits[] instead of multiple edit calls',
      'Each edits[].oldText is matched against the original file, not after earlier edits are applied. Do not emit overlapping or nested edits. Merge nearby changes into one edit.',
      'Keep edits[].oldText as small as possible while still being unique in the file, unless edits[].replaceAll is true. Do not pad with large unchanged regions.',
      'Use edits[].replaceAll only when the same exact oldText must be replaced at every non-overlapping occurrence in the file.',
    ]);
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
    expect(result.details?.diff).toContain('-1 foo bar foo baz foo');
    expect(result.details?.diff).toContain('+1 qux bar qux baz qux');
    expect(result.details?.patch).toContain(`--- ${filePath}`);
    expect(result.details?.firstChangedLine).toBe(1);
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
    expect(result).toEqual({
      baseContent: originalContent,
      newContent: 'FOO\nBAR\nFOO\nbaz\n',
      replacementCount: 3,
    });
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

  it('adds a replaceAll hint to the invocation when replaceAll is true', () => {
    // Arrange
    const baseTool = createBaseTool({ execute: vi.fn() });
    const tool = createCustomEditToolDefinition(DEFAULT_CUSTOM_EDIT_CONFIG, { baseTool });

    // Act
    const component = tool.renderCall?.(
      {
        path: '../../../../../../../tmp/pi-edit-tool-stress.IhceMQ/sample/src/config.json',
        edits: [{ oldText: 'enabled', newText: 'active', replaceAll: true }],
      },
      createTheme() as never,
      { cwd: process.cwd(), lastComponent: undefined } as never
    );

    // Assert
    expect(component).toBeInstanceOf(Text);
    expect((component as Text).render(200).join('\n')).toContain(
      'edit ../../../../../../../tmp/pi-edit-tool-stress.IhceMQ/sample/src/config.json (replaceAll)'
    );
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

function createTheme() {
  return {
    bold: (text: string) => text,
    fg: (_color: string, text: string) => text,
  };
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
