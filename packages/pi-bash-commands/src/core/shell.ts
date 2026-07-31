const BASH_COMMANDS_MARKER = '# @trethore/pi-bash-commands:path';

export function quoteShell(value: string): string {
  if (value.includes('\0')) throw new Error('Shell values cannot contain NUL bytes.');
  return `'${value.replaceAll("'", String.raw`'\''`)}'`;
}

export function prependBashCommandsPath(command: string, directory: string): string {
  if (command.startsWith(`${BASH_COMMANDS_MARKER}\n`)) return command;

  const prefix = [
    BASH_COMMANDS_MARKER,
    `_pi_bash_commands_path=$(cd ${quoteShell(directory)} && pwd -P) || exit $?`,
    'export PATH="${_pi_bash_commands_path}${PATH:+:${PATH}}"',
    'unset _pi_bash_commands_path',
  ].join('\n');
  return `${prefix}\n${command}`;
}
