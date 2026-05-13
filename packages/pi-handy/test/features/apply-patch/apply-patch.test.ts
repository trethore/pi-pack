import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyDiff, applyPatchOperation } from '#pi-handy/features/apply-patch/apply-patch.js';

describe('applyDiff', () => {
  it('updates matching hunks while preserving surrounding content', () => {
    // Arrange
    const currentContent = [
      'export function fib(n: number) {',
      '  return fib(n - 1);',
      '}',
      '',
    ].join('\n');
    const diff = [
      '@@',
      '-export function fib(n: number) {',
      '+export function fibonacci(n: number) {',
      '   return fib(n - 1);',
      '}',
    ].join('\n');

    // Act
    const updatedContent = applyDiff(currentContent, diff);

    // Assert
    expect(updatedContent).toBe(
      ['export function fibonacci(n: number) {', '  return fib(n - 1);', '}', ''].join('\n')
    );
  });

  it('accepts diffs with trailing newlines', () => {
    expect(applyDiff('old line\n', '@@\n-old line\n+new line\n')).toBe('new line\n');
  });

  it('reports invalid context when a hunk cannot be matched', () => {
    expect(() =>
      applyDiff('const name = "new";\n', '@@\n-const name = "old";\n+const name = "new";')
    ).toThrow('Invalid Context');
  });
});

describe('applyPatchOperation', () => {
  it('creates a file from added diff lines', async () => {
    // Arrange
    const workspace = makeTempWorkspace();

    // Act
    const result = await applyPatchOperation(workspace, {
      type: 'create_file',
      path: 'notes/tasks.md',
      diff: '+- buy milk\n+- write tests\n',
    });

    // Assert
    expect(result.status).toBe('completed');
    expect(readFileSync(path.join(workspace, 'notes', 'tasks.md'), 'utf8')).toBe(
      '- buy milk\n- write tests\n'
    );
  });

  it('updates an existing file', async () => {
    // Arrange
    const workspace = makeTempWorkspace();
    writeFileSync(path.join(workspace, 'readme.md'), 'Hello\nold line\nBye\n');

    // Act
    const result = await applyPatchOperation(workspace, {
      type: 'update_file',
      path: 'readme.md',
      diff: '@@\n Hello\n-old line\n+new line\n Bye',
    });

    // Assert
    expect(result.status).toBe('completed');
    expect(readFileSync(path.join(workspace, 'readme.md'), 'utf8')).toBe('Hello\nnew line\nBye\n');
  });

  it('deletes an existing file', async () => {
    // Arrange
    const workspace = makeTempWorkspace();
    const targetPath = path.join(workspace, 'delete-me.txt');
    writeFileSync(targetPath, 'remove me');

    // Act
    const result = await applyPatchOperation(workspace, {
      type: 'delete_file',
      path: 'delete-me.txt',
    });

    // Assert
    expect(result.status).toBe('completed');
    expect(existsSync(targetPath)).toBe(false);
  });

  it.each([
    ['add', 'Created alias.txt'],
    ['create', 'Created alias.txt'],
  ] as const)('accepts %s as a create_file alias', async (operationType, expectedOutput) => {
    // Arrange
    const workspace = makeTempWorkspace();

    // Act
    const result = await applyPatchOperation(workspace, {
      type: operationType,
      path: 'alias.txt',
      diff: '+hello\n',
    });

    // Assert
    expect(result).toEqual({ status: 'completed', output: expectedOutput });
    expect(readFileSync(path.join(workspace, 'alias.txt'), 'utf8')).toBe('hello\n');
  });

  it('reports missing diffs for operations that require file contents', async () => {
    // Arrange
    const workspace = makeTempWorkspace();

    // Act
    const result = await applyPatchOperation(workspace, {
      type: 'update',
      path: 'missing.txt',
    });

    // Assert
    expect(result).toEqual({
      status: 'failed',
      output: 'Error: Invalid update operation: diff is required',
    });
  });

  it('rejects paths outside the workspace', async () => {
    // Arrange
    const workspace = makeTempWorkspace();

    // Act
    const result = await applyPatchOperation(workspace, {
      type: 'create_file',
      path: '../escape.txt',
      diff: '+nope',
    });

    // Assert
    expect(result).toEqual({
      status: 'failed',
      output: expect.stringContaining('path escapes the workspace'),
    });
  });
});

function makeTempWorkspace(): string {
  const workspace = path.join(tmpdir(), `pi-handy-apply-patch-${randomUUID()}`);
  rmSync(workspace, { recursive: true, force: true });
  mkdirSync(workspace, { recursive: true });
  return workspace;
}
