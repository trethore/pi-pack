import type { AutocompleteItem } from '@earendil-works/pi-tui';
import { resetActions } from '#src/codex/reset.js';
import {
  reasoningSummaryValues,
  serviceTierValues,
  verbosityValues,
  type PiCodexifyConfig,
} from '#src/config/types.js';
import { commandAvailable, commandNames, commandNeedsArgument, normalizeCommand } from '#src/command/definitions.js';
import { splitArgs } from '#src/command/handler.js';

const verbosityCompletions = [...verbosityValues, 'off'] as const;
const summaryCompletions = [...reasoningSummaryValues, 'off'] as const;

export async function getCompletions(prefix: string, config: PiCodexifyConfig): Promise<AutocompleteItem[] | null> {
  if (!config.enabled) return null;

  const trailingWhitespace = /\s$/.test(prefix);
  const parts = splitArgs(prefix);
  const path = trailingWhitespace ? parts : parts.slice(0, -1);
  const token = trailingWhitespace ? '' : (parts.at(-1) ?? '');

  return path.length === 0 ? rootCompletions(path, token, config) : directCompletions(path, token, config);
}

function directCompletions(path: string[], token: string, config: PiCodexifyConfig): AutocompleteItem[] | null {
  if (path.length !== 1) return null;
  const command = normalizeCommand(path[0]);
  if (!command || !commandAvailable(command, config)) return null;

  if (command === 'verbosity') return items(path, token, verbosityCompletions);
  if (command === 'reasoning-summary') return items(path, token, summaryCompletions);
  if (command === 'service-tier') return items(path, token, serviceTierValues);
  if (command === 'reset') return items(path, token, resetActions);
  return null;
}

function rootCompletions(path: string[], token: string, config: PiCodexifyConfig): AutocompleteItem[] | null {
  return items(
    path,
    token,
    commandNames.filter((command) => commandAvailable(command, config)),
    (candidate) => (commandNeedsArgument(candidate) ? `${candidate} ` : candidate)
  );
}

function items<TCandidate extends string>(
  path: string[],
  token: string,
  candidates: readonly TCandidate[],
  format: (candidate: TCandidate) => string = (candidate) => candidate
): AutocompleteItem[] | null {
  const matches = candidates
    .filter((candidate) => candidate.startsWith(token))
    .map((candidate) => ({ value: [...path, format(candidate)].join(' '), label: candidate }));
  return matches.length > 0 ? matches : null;
}
