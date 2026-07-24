import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readJsoncConfigFile } from '@trethore/pi-shared/config/config-file.js';

describe('readJsoncConfigFile', () => {
  it('reports unreadable configuration paths', () => {
    // Arrange
    const root = mkdtempSync(path.join(tmpdir(), 'pi-shared-config-file-'));
    const configPath = path.join(root, 'config.jsonc');
    const errors: string[] = [];
    mkdirSync(configPath);

    // Act
    const config = readJsoncConfigFile(configPath, 'test-extension', errors);

    // Assert
    expect(config).toBeUndefined();
    expect(errors[0]).toContain(`test-extension config ignored: could not read ${configPath}`);
  });
});
