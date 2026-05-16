import type { AutocompleteItem } from '@earendil-works/pi-tui';

import type { PiCodexifyConfig } from '#src/config/schema.js';
import { codexAccountActions, parseCodexAccountAction } from '#src/features/accounts/index.js';

interface CompletionCommand {
  name: string;
  aliases?: readonly string[];
  needsMoreArgs?: boolean;
  isAvailable(config: PiCodexifyConfig): boolean;
}

type CompletionState = {
  path: string[];
  currentToken: string;
};

export function getCodexifyArgumentCompletions(
  prefix: string,
  config: PiCodexifyConfig,
  commands: readonly CompletionCommand[]
): AutocompleteItem[] | null {
  const state = parseCompletionState(prefix);

  if (state.path.length === 0) {
    return buildCompletionItems(state, getRootCompletionCandidates(config, commands), commands);
  }

  if (state.path.length === 1 && state.path[0] === 'verbosity' && config.codex.enabled) {
    return buildCompletionItems(state, ['low', 'medium', 'high', 'off'], commands);
  }

  if (
    state.path.length === 1 &&
    isReasoningSummaryCommand(state.path[0], commands) &&
    config.codex.enabled
  ) {
    return buildCompletionItems(state, ['auto', 'concise', 'detailed', 'off'], commands);
  }

  if (state.path.length === 1 && state.path[0] === 'account') {
    return buildCompletionItems(state, codexAccountActions, commands);
  }

  return null;
}

export function splitArgs(args: string): string[] {
  const trimmed = args.trim();
  return trimmed ? trimmed.split(/\s+/) : [];
}

function getRootCompletionCandidates(
  config: PiCodexifyConfig,
  commands: readonly CompletionCommand[]
): string[] {
  return commands.filter((command) => command.isAvailable(config)).map((command) => command.name);
}

function parseCompletionState(prefix: string): CompletionState {
  const hasTrailingWhitespace = /\s$/.test(prefix);
  const parts = splitArgs(prefix);

  if (hasTrailingWhitespace) {
    return {
      path: parts,
      currentToken: '',
    };
  }

  return {
    path: parts.slice(0, -1),
    currentToken: parts.at(-1) ?? '',
  };
}

function buildCompletionItems(
  state: CompletionState,
  candidates: readonly string[],
  commands: readonly CompletionCommand[]
): AutocompleteItem[] | null {
  const items = candidates
    .filter((candidate) => candidate.startsWith(state.currentToken))
    .map((candidate) => ({
      value: [...state.path, formatCompletionToken(candidate, commands)].join(' '),
      label: candidate,
    }));

  return items.length > 0 ? items : null;
}

function formatCompletionToken(candidate: string, commands: readonly CompletionCommand[]): string {
  return candidateNeedsMoreArgs(candidate, commands) ? `${candidate} ` : candidate;
}

function candidateNeedsMoreArgs(
  candidate: string,
  commands: readonly CompletionCommand[]
): boolean {
  return (
    findCommand(candidate, commands)?.needsMoreArgs === true ||
    parseCodexAccountAction(candidate) != null
  );
}

function isReasoningSummaryCommand(
  command: string,
  commands: readonly CompletionCommand[]
): boolean {
  return findCommand(command, commands)?.name === 'reasoning-summary';
}

function findCommand(
  commandName: string,
  commands: readonly CompletionCommand[]
): CompletionCommand | undefined {
  return commands.find(
    (command) => command.name === commandName || command.aliases?.includes(commandName)
  );
}
