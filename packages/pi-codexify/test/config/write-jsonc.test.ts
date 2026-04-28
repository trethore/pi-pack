import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { updateJsoncFile } from '#pi-codexify/config/write-jsonc.js';

describe('updateJsoncFile', () => {
  it('creates parent directories and writes nested JSONC values', async () => {
    // Arrange
    const filePath = path.join(makeTempDir(), '.pi', 'pi-codexify.jsonc');

    // Act
    await updateJsoncFile(filePath, [
      { path: ['codex', 'verbosity'], value: 'high' },
      { path: ['webSearch', 'enabled'], value: false },
    ]);

    // Assert
    expect(readFileSync(filePath, 'utf8')).toBe(
      `{
  "codex": {
    "verbosity": "high"
  },
  "webSearch": {
    "enabled": false
  }
}
`
    );
  });

  it('removes configured empty parent objects after deleting values', async () => {
    // Arrange
    const filePath = path.join(makeTempDir(), 'pi-codexify.jsonc');
    writeFileSync(
      filePath,
      '{\n  "codex": {\n    "verbosity": "low"\n  },\n  "enabled": true\n}\n'
    );

    // Act
    await updateJsoncFile(
      filePath,
      [{ path: ['codex', 'verbosity'], value: undefined }],
      [['codex']]
    );

    // Assert
    expect(readFileSync(filePath, 'utf8')).toBe(`{
  "enabled": true
}
`);
  });

  it('preserves detected indentation and end of line style', async () => {
    // Arrange
    const filePath = path.join(makeTempDir(), 'pi-codexify.jsonc');
    writeFileSync(filePath, '{\r\n\t"codex": {\r\n\t\t"verbosity": "low"\r\n\t}\r\n}\r\n');

    // Act
    await updateJsoncFile(filePath, [{ path: ['codex', 'reasoningSummary'], value: 'auto' }]);

    // Assert
    expect(readFileSync(filePath, 'utf8')).toBe(
      '{\r\n\t"codex": {\r\n\t\t"verbosity": "low",\r\n\t\t"reasoningSummary": "auto"\r\n\t}\r\n}\r\n'
    );
  });
});

function makeTempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'pi-codexify-test-'));
}
