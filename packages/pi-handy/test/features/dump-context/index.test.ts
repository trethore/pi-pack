import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { dumpProviderRequestPayload, stringifyPayload } from '#pi-handy/features/dump-context/index.js';

describe('dump context command', () => {
  it('dumps provider request payload to the agent directory', async () => {
    // Arrange
    const outputDirectory = path.join(tmpdir(), `pi-handy-context-dump-${randomUUID()}`);
    const payload = {
      model: 'gpt-5.5-codex',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'Hello' }] }],
      tools: [{ type: 'function', name: 'bash' }],
    };

    // Act
    const filePath = await dumpProviderRequestPayload(payload, {
      now: new Date('2026-06-09T12:34:56.789Z'),
      outputDirectory,
    });

    // Assert
    expect(filePath).toBe(path.join(outputDirectory, '.context-dump-2026-06-09T12:34:56.789Z'));
    await expect(readFile(filePath, 'utf8')).resolves.toContain('"model": "gpt-5.5-codex"');
    await expect(readFile(filePath, 'utf8')).resolves.toContain('"tools"');
  });

  it('stringifies circular payloads', () => {
    // Arrange
    const payload: { self?: unknown } = {};
    payload.self = payload;

    // Act
    const serializedPayload = stringifyPayload(payload);

    // Assert
    expect(serializedPayload).toContain('"self": "[Circular]"');
  });
});
