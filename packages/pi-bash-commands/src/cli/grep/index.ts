#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import { formatGrepResult } from '#pi-bash-commands-cli/grep/format';
import { runCli, type RunCliOptions } from '#pi-bash-commands-cli/shared/cli';
import { PI_GREP_HELP } from '#pi-bash-commands-cli/shared/metadata';
import { parseGrepCliOptions, type GrepCliOptions } from '#pi-bash-commands-cli/shared/options';
import { runGrep } from '#pi-bash-commands-cli/shared/ripgrep';
import { assertSearchPaths } from '#pi-bash-commands-cli/shared/search';

const PI_GREP_CLI = {
  name: 'pi-grep',
  help: PI_GREP_HELP,
  parse: parseGrepCliOptions,
  async execute(options: GrepCliOptions, cwd: string) {
    await assertSearchPaths(cwd, options.paths);
    const result = await runGrep({ cwd, ...options });
    return formatGrepResult({
      matches: result.matches,
      limit: options.limit,
      paths: options.paths,
      limitPerFile: options.limitPerFile,
      limited: result.limited,
    });
  },
};

export function runPiGrepCli(args: readonly string[], options: RunCliOptions = {}): Promise<number> {
  return runCli(args, options, PI_GREP_CLI);
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = await runPiGrepCli(process.argv.slice(2));
}
