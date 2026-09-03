import { resetConfigTestEnvironment } from '@trethore/shared/test/config-test-helpers.js';
import { afterEach, describe, expect, it } from 'vitest';

import { defaultMessages } from '#pi-whimsical/config/messages.js';
import {
  importConfigWithHome,
  makeTempDir,
  writeGlobalConfig,
  writeProjectConfig,
} from '#test/utils/config-test-helpers.js';

describe('loadConfig', () => {
  afterEach(resetConfigTestEnvironment);

  it('loads the default messages when no config files exist', async () => {
    const { loadConfig } = await importConfigWithHome(makeTempDir());

    const loaded = loadConfig(makeTempDir());

    expect(loaded.errors).toEqual([]);
    expect(loaded.config).toEqual({ enabled: true, messages: defaultMessages });
  });

  it('merges global config before project config', async () => {
    // Arrange
    const homeDir = makeTempDir();
    writeGlobalConfig(homeDir, JSON.stringify({ enabled: false, messages: ['Global...'] }));
    const { loadConfig } = await importConfigWithHome(homeDir);
    const cwd = makeTempDir();
    writeProjectConfig(cwd, JSON.stringify({ enabled: true, messages: ['Project...'] }));

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config).toEqual({ enabled: true, messages: ['Project...'] });
  });

  it('resets inherited custom messages to defaults when messages is null', async () => {
    // Arrange
    const homeDir = makeTempDir();
    writeGlobalConfig(homeDir, JSON.stringify({ messages: ['Global...'] }));
    const { loadConfig } = await importConfigWithHome(homeDir);
    const cwd = makeTempDir();
    writeProjectConfig(cwd, JSON.stringify({ messages: null }));

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.messages).toEqual(defaultMessages);
  });

  it.each([
    { name: 'empty array', messages: [] },
    { name: 'empty string', messages: [''] },
    { name: 'non-array', messages: 'Thinking...' },
  ])('keeps defaults and reports an error for $name', async ({ messages }) => {
    // Arrange
    const { loadConfig } = await importConfigWithHome(makeTempDir());
    const cwd = makeTempDir();
    writeProjectConfig(cwd, JSON.stringify({ messages }));

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.config.messages).toEqual(defaultMessages);
    expect(loaded.errors).toEqual([expect.stringContaining('invalid messages value')]);
  });
});
