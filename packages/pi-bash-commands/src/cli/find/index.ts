#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import { formatFindResult } from '#pi-bash-commands-cli/find/format';
import { runCli, type RunCliOptions } from '#pi-bash-commands-cli/shared/cli';
import { PI_FIND_HELP } from '#pi-bash-commands-cli/shared/metadata';
import { parseFindCliOptions, type FindCliOptions } from '#pi-bash-commands-cli/shared/options';
import { runFind } from '#pi-bash-commands-cli/shared/ripgrep';
import { assertSearchPaths } from '#pi-bash-commands-cli/shared/search';

const PI_FIND_CLI = {
  name: 'pi-find',
  help: PI_FIND_HELP,
  parse: parseFindCliOptions,
  async execute(options: FindCliOptions, cwd: string) {
    await assertSearchPaths(cwd, options.paths, { requireDirectory: true });
    const result = await runFind({ cwd, ...options });
    return formatFindResult({ paths: options.paths, ...result });
  },
};

export function runPiFindCli(args: readonly string[], options: RunCliOptions = {}): Promise<number> {
  return runCli(args, options, PI_FIND_CLI);
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = await runPiFindCli(process.argv.slice(2));
}
