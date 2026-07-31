import type { BashCommandConfig } from '#src/config/schema.js';

export const BASH_COMMANDS_PROMPT_MARKER = '<!-- @trethore/pi-bash-commands -->';

export function buildBashCommandsPrompt(commands: readonly BashCommandConfig[]): string | undefined {
  const sections = commands.filter((command) => hasPrompt(command)).map((command) => formatCommandPrompt(command));
  if (sections.length === 0) return undefined;

  return [
    BASH_COMMANDS_PROMPT_MARKER,
    '## Bash Commands',
    '',
    "These commands are available through Pi's bash tool.",
    '',
    sections.join('\n\n'),
  ].join('\n');
}

function hasPrompt(command: BashCommandConfig): boolean {
  return command.enabled && Boolean(command.prompt?.description || command.prompt?.usage);
}

function formatCommandPrompt(command: BashCommandConfig): string {
  const lines = [`### ${command.name}`];
  if (command.prompt?.description) lines.push('', `Description: ${command.prompt.description}`);
  if (command.prompt?.usage) lines.push('', `Usage: ${command.prompt.usage}`);
  return lines.join('\n');
}
