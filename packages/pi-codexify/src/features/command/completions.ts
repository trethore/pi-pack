import type { AutocompleteItem } from '@earendil-works/pi-tui';

import {
  codexReasoningSummaryValues,
  codexServiceTierValues,
  codexVerbosityValues,
  type PiCodexifyConfig,
} from '#src/config/schema.js';
import {
  codexAccountActions,
  getSavedCodexAccountNames,
  parseCodexAccountAction,
} from '#src/features/accounts/index.js';
import { resetCreditActions } from '#src/features/reset-credit/index.js';

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

type DirectArgumentCompletion = {
  commandName: string;
  enabled: boolean;
  candidates: readonly string[];
  itemOptions?: CompletionItemOptions;
};

const codexVerbosityCompletionValues = [...codexVerbosityValues, 'off'] as const;
const codexReasoningSummaryCompletionValues = [...codexReasoningSummaryValues, 'off'] as const;

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
  const commandName = findCommand(command, commands)?.name ?? command;
  const completion = getDirectArgumentCompletion(commandName, config);

  if (!completion) return null;
  return buildCompletionItems(state, completion.candidates, commands, completion.itemOptions);
}

function getDirectArgumentCompletion(
  commandName: string,
  config: PiCodexifyConfig
): DirectArgumentCompletion | undefined {
  return getDirectArgumentCompletionOptions(config).find(
    (completion) => completion.commandName === commandName && completion.enabled
  );
}

function getDirectArgumentCompletionOptions(config: PiCodexifyConfig): readonly DirectArgumentCompletion[] {
  return [
    {
      commandName: 'verbosity',
      enabled: config.codex.enabled,
      candidates: codexVerbosityCompletionValues,
    },
    {
      commandName: 'reasoning-summary',
      enabled: config.codex.enabled,
      candidates: codexReasoningSummaryCompletionValues,
    },
    {
      commandName: 'serviceTier',
      enabled: config.codex.enabled,
      candidates: codexServiceTierValues,
    },
    {
      commandName: 'account',
      enabled: config.account.enabled,
      candidates: codexAccountActions,
    },
    {
      commandName: 'reset',
      enabled: config.reset.enabled,
      candidates: resetCreditActions,
      itemOptions: { appendNeedsMoreArgs: false },
    },
  ];
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
  return findCommand(candidate, commands)?.needsMoreArgs === true || parseCodexAccountAction(candidate) != null;
}

function hasAccountNameCompletion(state: CompletionState): boolean {
  const action = parseCodexAccountAction(state.path[1]);
  return action === 'use' || action === 'delete';
}

function findCommand(commandName: string, commands: readonly CompletionCommand[]): CompletionCommand | undefined {
  return commands.find((command) => command.name === commandName || command.aliases?.includes(commandName));
}
