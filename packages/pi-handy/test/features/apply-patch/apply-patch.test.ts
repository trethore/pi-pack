import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyPatch } from '#pi-handy/features/apply-patch/apply-patch.js';

describe('applyPatch', () => {
  it('applies a unified diff that creates a file', async () => {
    // Arrange
    const workspace = makeTempWorkspace();
    const patch = [
      'diff --git a/notes/tasks.md b/notes/tasks.md',
      'new file mode 100644',
      'index 0000000..f69532c',
      '--- /dev/null',
      '+++ b/notes/tasks.md',
      '@@ -0,0 +1,2 @@',
      '+- buy milk',
      '+- write tests',
      '',
    ].join('\n');

    // Act
    const result = await applyPatch(workspace, patch);

    // Assert
    expect(result).toEqual({ status: 'completed', output: 'Patch applied' });
    expect(readFileSync(path.join(workspace, 'notes', 'tasks.md'), 'utf8')).toBe(
      '- buy milk\n- write tests\n'
    );
  });

  it('applies a unified diff that updates an existing file', async () => {
    // Arrange
    const workspace = makeTempWorkspace();
    writeFileSync(path.join(workspace, 'readme.md'), 'Hello\nold line\nBye\n');
    const patch = [
      'diff --git a/readme.md b/readme.md',
      'index f6739b7..1b4e214 100644',
      '--- a/readme.md',
      '+++ b/readme.md',
      '@@ -1,3 +1,3 @@',
      ' Hello',
      '-old line',
      '+new line',
      ' Bye',
      '',
    ].join('\n');

    // Act
    const result = await applyPatch(workspace, patch);

    // Assert
    expect(result).toEqual({ status: 'completed', output: 'Patch applied' });
    expect(readFileSync(path.join(workspace, 'readme.md'), 'utf8')).toBe('Hello\nnew line\nBye\n');
  });

  it('applies a unified diff that deletes an existing file', async () => {
    // Arrange
    const workspace = makeTempWorkspace();
    const targetPath = path.join(workspace, 'delete-me.txt');
    writeFileSync(targetPath, 'remove me\n');
    const patch = [
      'diff --git a/delete-me.txt b/delete-me.txt',
      'deleted file mode 100644',
      'index 7f14183..0000000',
      '--- a/delete-me.txt',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-remove me',
      '',
    ].join('\n');

    // Act
    const result = await applyPatch(workspace, patch);

    // Assert
    expect(result).toEqual({ status: 'completed', output: 'Patch applied' });
    expect(existsSync(targetPath)).toBe(false);
  });

  it('applies a multi-file unified diff', async () => {
    // Arrange
    const workspace = makeTempWorkspace();
    writeFileSync(path.join(workspace, 'first.txt'), 'old\n');
    const patch = [
      'diff --git a/first.txt b/first.txt',
      'index 3e75765..8a0df76 100644',
      '--- a/first.txt',
      '+++ b/first.txt',
      '@@ -1 +1 @@',
      '-old',
      '+new',
      'diff --git a/second.txt b/second.txt',
      'new file mode 100644',
      'index 0000000..2e65efe',
      '--- /dev/null',
      '+++ b/second.txt',
      '@@ -0,0 +1 @@',
      '+created',
      '',
    ].join('\n');

    // Act
    const result = await applyPatch(workspace, patch);

    // Assert
    expect(result).toEqual({ status: 'completed', output: 'Patch applied' });
    expect(readFileSync(path.join(workspace, 'first.txt'), 'utf8')).toBe('new\n');
    expect(readFileSync(path.join(workspace, 'second.txt'), 'utf8')).toBe('created\n');
  });

  it('applies a unified diff that renames a file', async () => {
    // Arrange
    const workspace = makeTempWorkspace();
    writeFileSync(path.join(workspace, 'old-name.txt'), 'old\n');
    const patch = [
      'diff --git a/old-name.txt b/new-name.txt',
      'similarity index 50%',
      'rename from old-name.txt',
      'rename to new-name.txt',
      'index 3e75765..8a0df76 100644',
      '--- a/old-name.txt',
      '+++ b/new-name.txt',
      '@@ -1 +1 @@',
      '-old',
      '+new',
      '',
    ].join('\n');

    // Act
    const result = await applyPatch(workspace, patch);

    // Assert
    expect(result).toEqual({ status: 'completed', output: 'Patch applied' });
    expect(existsSync(path.join(workspace, 'old-name.txt'))).toBe(false);
    expect(readFileSync(path.join(workspace, 'new-name.txt'), 'utf8')).toBe('new\n');
  });

  it('validates the patch before applying it', async () => {
    // Arrange
    const workspace = makeTempWorkspace();
    writeFileSync(path.join(workspace, 'readme.md'), 'new line\n');
    const patch = [
      'diff --git a/readme.md b/readme.md',
      'index 3e75765..8a0df76 100644',
      '--- a/readme.md',
      '+++ b/readme.md',
      '@@ -1 +1 @@',
      '-old line',
      '+new line',
      '',
    ].join('\n');

    // Act
    const result = await applyPatch(workspace, patch);

    // Assert
    expect(result.status).toBe('failed');
    expect(result.output).toContain('Patch validation failed');
    expect(readFileSync(path.join(workspace, 'readme.md'), 'utf8')).toBe('new line\n');
  });

  it('rejects patch paths outside the workspace', async () => {
    // Arrange
    const workspace = makeTempWorkspace();
    const patch = [
      'diff --git a/../escape.txt b/../escape.txt',
      'new file mode 100644',
      'index 0000000..2e65efe',
      '--- /dev/null',
      '+++ b/../escape.txt',
      '@@ -0,0 +1 @@',
      '+escape',
      '',
    ].join('\n');

    // Act
    const result = await applyPatch(workspace, patch);

    // Assert
    expect(result.status).toBe('failed');
    expect(result.output).toContain('path escapes the workspace');
    expect(existsSync(path.join(workspace, '..', 'escape.txt'))).toBe(false);
  });

  it('rejects empty patches', async () => {
    // Arrange
    const workspace = makeTempWorkspace();

    // Act
    const result = await applyPatch(workspace, '   \n');

    // Assert
    expect(result).toEqual({ status: 'failed', output: 'Error: patch is required' });
  });
});

function makeTempWorkspace(): string {
  const workspace = path.join(tmpdir(), `pi-handy-apply-patch-${randomUUID()}`);
  rmSync(workspace, { recursive: true, force: true });
  mkdirSync(workspace, { recursive: true });
  return workspace;
}
