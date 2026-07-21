import type { PiCodexifyConfig } from '#src/config/types.js';

export const commandNames = [
  'help',
  'status',
  'usage',
  'reset',
  'verbosity',
  'reasoning-summary',
  'service-tier',
] as const;

export type CommandName = (typeof commandNames)[number];

const usageByCommand: Record<CommandName, string> = {
  help: '/codexify help',
  status: '/codexify status',
  usage: '/codexify usage',
  reset: '/codexify reset use|details',
  verbosity: '/codexify verbosity low|medium|high|off',
  'reasoning-summary': '/codexify reasoning-summary auto|concise|detailed|none|off',
  'service-tier': '/codexify service-tier default|priority',
};

export function commandUsage(command: CommandName): string {
  return usageByCommand[command];
}

export function normalizeCommand(value: string): CommandName | undefined {
  if (value === 'summary') return 'reasoning-summary';
  return commandNames.find((command) => command === value);
}

export function commandNeedsArgument(command: CommandName): boolean {
  return (
    command === 'reset' || command === 'verbosity' || command === 'reasoning-summary' || command === 'service-tier'
  );
}

export function commandAvailable(command: CommandName, config: PiCodexifyConfig): boolean {
  if (command === 'usage') return config.usage;
  if (command === 'reset') return config.reset;
  if (command === 'verbosity' || command === 'reasoning-summary' || command === 'service-tier') {
    return config.controls.enabled;
  }
  return true;
}

export function buildUsage(config: PiCodexifyConfig): string {
  return [
    'pi-codexify commands',
    ...commandNames.filter((command) => commandAvailable(command, config)).map((command) => commandUsage(command)),
  ].join('\n');
}
