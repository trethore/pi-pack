import type { BashCommandConfig, PiBashCommandsConfig } from '#pi-bash-commands/config/schema.js';

interface CreateTestConfigOptions {
  prompt?: BashCommandConfig['prompt'];
}

export function createTestConfig(options: CreateTestConfigOptions = {}): PiBashCommandsConfig {
  return {
    enabled: true,
    builtIns: {
      'pi-find': { enabled: false, defaultLimit: 100 },
      'pi-grep': { enabled: false, defaultLimit: 200, defaultMaxCharsPerMatch: 200 },
    },
    commands: [
      {
        enabled: true,
        name: 'example',
        command: process.execPath,
        args: [],
        env: {},
        prompt: options.prompt,
      },
    ],
  };
}
