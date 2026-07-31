import { getErrorMessage } from '@trethore/pi-shared/error.js';

import type { ParsedCliOptions } from '#pi-bash-commands-cli/shared/options';

interface CliWriter {
  write(value: string): unknown;
}

export interface CliIo {
  stdout: CliWriter;
  stderr: CliWriter;
}

export interface RunCliOptions {
  cwd?: string;
  io?: CliIo;
}

interface CliDefinition<TOptions> {
  name: string;
  help: string;
  parse(args: readonly string[]): ParsedCliOptions<TOptions>;
  execute(options: TOptions, cwd: string): Promise<string>;
}

const PROCESS_IO: CliIo = {
  stdout: process.stdout,
  stderr: process.stderr,
};

export async function runCli<TOptions>(
  args: readonly string[],
  options: RunCliOptions,
  definition: CliDefinition<TOptions>
): Promise<number> {
  const io = options.io ?? PROCESS_IO;
  let parsed;
  try {
    parsed = definition.parse(args);
  } catch (error) {
    io.stderr.write(
      `${definition.name}: ${getErrorMessage(error)}\nTry '${definition.name} --help' for more information.\n`
    );
    return 2;
  }
  if (parsed.help) {
    io.stdout.write(`${definition.help}\n`);
    return 0;
  }

  try {
    io.stdout.write(`${await definition.execute(parsed.options, options.cwd ?? process.cwd())}\n`);
    return 0;
  } catch (error) {
    io.stderr.write(`${definition.name}: ${getErrorMessage(error)}\n`);
    return 1;
  }
}
