import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '#src/config/schema.js';
import { ScriptOutputCache } from '#src/scripts/cache.js';

describe('ScriptOutputCache', () => {
  it('runs each template once', () => {
    // Arrange
    const directory = mkdtempSync(path.join(tmpdir(), 'pi-script-template-cache-'));
    const counterPath = path.join(directory, 'counter.txt');
    const scriptPath = path.join(directory, 'counter.mjs');
    writeFileSync(counterPath, '0');
    writeFileSync(
      scriptPath,
      'import fs from "node:fs"; const path = new URL("counter.txt", import.meta.url); const next = Number(fs.readFileSync(path, "utf8")) + 1; fs.writeFileSync(path, String(next)); process.stdout.write(String(next));'
    );
    const scripts = new Map([['counter', { name: 'counter', filePath: scriptPath, scope: 'project' as const }]]);
    const cache = new ScriptOutputCache({
      execution: defaultConfig.execution,
      scripts,
      workspaceCwd: directory,
    });

    // Act
    const first = cache.getOutput('counter');
    const second = cache.getOutput('counter');

    // Assert
    expect([first, second]).toEqual(['1', '1']);
    expect(readFileSync(counterPath, 'utf8')).toBe('1');
  });
});
