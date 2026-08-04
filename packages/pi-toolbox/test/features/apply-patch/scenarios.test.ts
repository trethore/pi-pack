import { cpSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { applyPatch } from '#pi-toolbox/features/apply-patch/apply.js';
import { makeTempDir } from '#test/utils/tool-test-helpers.js';

const SCENARIOS_DIRECTORY = path.join(import.meta.dirname, 'fixtures/scenarios');

type SnapshotEntry = { type: 'directory' } | { type: 'file'; contents: Buffer };

describe('Codex apply_patch scenarios', () => {
  const scenarios = readdirSync(SCENARIOS_DIRECTORY, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  for (const scenario of scenarios) {
    it(scenario, async () => {
      // Arrange
      const scenarioDirectory = path.join(SCENARIOS_DIRECTORY, scenario);
      const inputDirectory = path.join(scenarioDirectory, 'input');
      const expectedDirectory = path.join(scenarioDirectory, 'expected');
      const cwd = makeTempDir('pi-toolbox-apply-patch-scenario-test-');
      if (existsSync(inputDirectory)) cpSync(inputDirectory, cwd, { recursive: true });
      const patch = readFileSync(path.join(scenarioDirectory, 'patch.txt'), 'utf8');

      // Act
      await applyPatch({ cwd, patch }).catch(() => null);

      // Assert
      expect(snapshotDirectory(cwd)).toEqual(snapshotDirectory(expectedDirectory));
    });
  }
});

function snapshotDirectory(
  root: string,
  directory = root,
  snapshot = new Map<string, SnapshotEntry>()
): Map<string, SnapshotEntry> {
  const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name)
  );

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    const relativePath = path.relative(root, entryPath);
    const stats = statSync(entryPath);
    if (stats.isDirectory()) {
      snapshot.set(relativePath, { type: 'directory' });
      snapshotDirectory(root, entryPath, snapshot);
    } else if (stats.isFile()) {
      snapshot.set(relativePath, { type: 'file', contents: readFileSync(entryPath) });
    }
  }

  return snapshot;
}
