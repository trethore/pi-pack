import type { AutocompleteItem } from '@earendil-works/pi-tui';

import type { PiCodexifyConfig } from '#src/config/schema.js';
import {
  codexAccountActions,
  getSavedCodexAccountNames,
  parseCodexAccountAction,
} from '#src/features/accounts/index.js';

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

type CompletionOptions = {
  accountProfilePath?: string;
};

type CompletionItemOptions = {
  appendNeedsMoreArgs?: boolean;
};

export async function getCodexifyArgumentCompletions(
  prefix: string,
  config: PiCodexifyConfig,
  commands: readonly CompletionCommand[],
  options: CompletionOptions = {}
): Promise<AutocompleteItem[] | null> {
  const state = parseCompletionState(prefix);

  if (state.path.length === 0) {
    return buildCompletionItems(state, getRootCompletionCandidates(config, commands), commands);
  }

  const directCompletions = getDirectArgumentCompletions(state, config, commands);
  if (directCompletions) return directCompletions;

  const compactionCompletions = getCompactionArgumentCompletions(state, commands);
  if (compactionCompletions) return compactionCompletions;
  if (!config.account.enabled) return null;

  return getAccountNameCompletions(state, commands, options);
}

function getDirectArgumentCompletions(
  state: CompletionState,
  config: PiCodexifyConfig,
  commands: readonly CompletionCommand[]
): AutocompleteItem[] | null {
  if (state.path.length !== 1) return null;

  const command = state.path[0];

  if (command === 'verbosity' && config.codex.enabled) {
    return buildCompletionItems(state, ['low', 'medium', 'high', 'off'], commands);
  }

  if (isReasoningSummaryCommand(command, commands) && config.codex.enabled) {
    return buildCompletionItems(state, ['auto', 'concise', 'detailed', 'off'], commands);
  }

  if (command === 'account' && config.account.enabled) {
    return buildCompletionItems(state, codexAccountActions, commands);
  }

  if (command === 'compaction') {
    return buildCompletionItems(state, ['on', 'off', 'model', 'reasoning'], commands);
  }

  return null;
}

function getCompactionArgumentCompletions(
  state: CompletionState,
  commands: readonly CompletionCommand[]
): AutocompleteItem[] | null {
  if (state.path.length === 2 && state.path[0] === 'compaction' && state.path[1] === 'reasoning') {
    return buildCompletionItems(state, ['current', 'minimal', 'low', 'medium', 'high', 'xhigh'], commands, {
      appendNeedsMoreArgs: false,
    });
  }

  return null;
}

async function getAccountNameCompletions(
  state: CompletionState,
  commands: readonly CompletionCommand[],
  options: CompletionOptions
): Promise<AutocompleteItem[] | null> {
  if (state.path.length !== 2 || state.path[0] !== 'account') return null;
  if (!hasAccountNameCompletion(state)) return null;

  try {
    const accountNames = await getSavedCodexAccountNames({
      profilePath: options.accountProfilePath,
    });
    return buildCompletionItems(state, accountNames, commands, { appendNeedsMoreArgs: false });
  } catch {
    return null;
  }
}

export function splitArgs(args: string): string[] {
  const trimmed = args.trim();
  return trimmed ? trimmed.split(/\s+/) : [];
}

function getRootCompletionCandidates(config: PiCodexifyConfig, commands: readonly CompletionCommand[]): string[] {
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
  commands: readonly CompletionCommand[],
  options: CompletionItemOptions = {}
): AutocompleteItem[] | null {
  const items = candidates
    .filter((candidate) => candidate.startsWith(state.currentToken))
    .map((candidate) => ({
      value: [...state.path, formatCompletionToken(candidate, commands, options)].join(' '),
      label: candidate,
    }));

  return items.length > 0 ? items : null;
}

function formatCompletionToken(
  candidate: string,
  commands: readonly CompletionCommand[],
  options: CompletionItemOptions
): string {
  if (options.appendNeedsMoreArgs === false) return candidate;
  return candidateNeedsMoreArgs(candidate, commands) ? `${candidate} ` : candidate;
}

function candidateNeedsMoreArgs(candidate: string, commands: readonly CompletionCommand[]): boolean {
  return (
    findCommand(candidate, commands)?.needsMoreArgs === true ||
    parseCodexAccountAction(candidate) != null ||
    candidate === 'model' ||
    candidate === 'reasoning'
  );
}

function hasAccountNameCompletion(state: CompletionState): boolean {
  const action = parseCodexAccountAction(state.path[1]);
  return action === 'use' || action === 'delete';
}

function isReasoningSummaryCommand(command: string, commands: readonly CompletionCommand[]): boolean {
  return findCommand(command, commands)?.name === 'reasoning-summary';
}

function findCommand(commandName: string, commands: readonly CompletionCommand[]): CompletionCommand | undefined {
  return commands.find((command) => command.name === commandName || command.aliases?.includes(commandName));
}
