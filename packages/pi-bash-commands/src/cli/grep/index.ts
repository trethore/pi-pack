#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import { formatGrepResult } from '#pi-bash-commands-cli/grep/format';
import { runCli, type RunCliOptions } from '#pi-bash-commands-cli/shared/cli';
import { readGrepCliDefaults } from '#pi-bash-commands-cli/shared/defaults';
import { createPiGrepHelp } from '#pi-bash-commands-cli/shared/metadata';
import { parseGrepCliOptions, type GrepCliOptions } from '#pi-bash-commands-cli/shared/options';
import { runGrep } from '#pi-bash-commands-cli/shared/ripgrep';
import { assertSearchPaths } from '#pi-bash-commands-cli/shared/search';

export function runPiGrepCli(args: readonly string[], options: RunCliOptions = {}): Promise<number> {
  const defaults = readGrepCliDefaults(process.env);
  return runCli(args, options, {
    name: 'pi-grep',
    help: createPiGrepHelp(defaults),
    parse: (values) => parseGrepCliOptions(values, defaults),
    async execute(parsedOptions: GrepCliOptions, cwd: string) {
      await assertSearchPaths(cwd, parsedOptions.paths);
      const result = await runGrep({ cwd, ...parsedOptions });
      return formatGrepResult({
        matches: result.matches,
        limit: parsedOptions.limit,
        paths: parsedOptions.paths,
        ...(parsedOptions.limitPerFile === undefined ? {} : { limitPerFile: parsedOptions.limitPerFile }),
        limited: result.limited,
      });
    },
  });
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = await runPiGrepCli(process.argv.slice(2));
}
