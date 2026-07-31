#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import { formatFindResult } from '#pi-bash-commands-cli/find/format';
import { runCli, type RunCliOptions } from '#pi-bash-commands-cli/shared/cli';
import { readFindCliDefaults } from '#pi-bash-commands-cli/shared/defaults';
import { createPiFindHelp } from '#pi-bash-commands-cli/shared/metadata';
import { parseFindCliOptions, type FindCliOptions } from '#pi-bash-commands-cli/shared/options';
import { runFind } from '#pi-bash-commands-cli/shared/ripgrep';
import { assertSearchPaths } from '#pi-bash-commands-cli/shared/search';

export function runPiFindCli(args: readonly string[], options: RunCliOptions = {}): Promise<number> {
  const defaults = readFindCliDefaults(process.env);
  return runCli(args, options, {
    name: 'pi-find',
    help: createPiFindHelp(defaults),
    parse: (values) => parseFindCliOptions(values, defaults),
    async execute(parsedOptions: FindCliOptions, cwd: string) {
      await assertSearchPaths(cwd, parsedOptions.paths, { requireDirectory: true });
      const result = await runFind({ cwd, ...parsedOptions });
      return formatFindResult({ paths: parsedOptions.paths, ...result });
    },
  });
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = await runPiFindCli(process.argv.slice(2));
}
