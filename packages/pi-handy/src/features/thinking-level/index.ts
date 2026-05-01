import type { ExtensionAPI, ExtensionCommandContext } from '@mariozechner/pi-coding-agent';
import type { AutocompleteItem } from '@mariozechner/pi-tui';

type ThinkingLevel = Parameters<ExtensionAPI['setThinkingLevel']>[0];

type ThinkingModel = {
  id: string;
  reasoning?: unknown;
};

const STANDARD_THINKING_LEVELS: ThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high'];
const XHIGH_THINKING_LEVELS: ThinkingLevel[] = [...STANDARD_THINKING_LEVELS, 'xhigh'];

const THINKING_LEVEL_DESCRIPTIONS: Record<ThinkingLevel, string> = {
  off: 'Disable model thinking/reasoning',
  minimal: 'Use minimal model thinking/reasoning',
  low: 'Use low model thinking/reasoning',
  medium: 'Use medium model thinking/reasoning',
  high: 'Use high model thinking/reasoning',
  xhigh: 'Use extra-high model thinking/reasoning when supported',
};

export function registerThinkingLevelCommand(pi: ExtensionAPI) {
  let currentModel: ThinkingModel | undefined;

  pi.on('session_start', (_event, ctx) => {
    currentModel = ctx.model;
  });

  pi.on('model_select', (event) => {
    currentModel = event.model;
  });

  pi.registerCommand('thinkinglevel', {
    description: 'Set the thinking level of the current model',
    getArgumentCompletions: (prefix) => getThinkingLevelArgumentCompletions(prefix, currentModel),
    handler: async (args, ctx) => {
      handleThinkingLevelCommand(pi, args, ctx);
    },
  });
}

export function handleThinkingLevelCommand(
  pi: Pick<ExtensionAPI, 'getThinkingLevel' | 'setThinkingLevel'>,
  args: string,
  ctx: Pick<ExtensionCommandContext, 'model' | 'ui'>
): void {
  const requestedLevel = args.trim();
  const availableLevels = getAvailableThinkingLevels(ctx.model);

  if (requestedLevel.length === 0) {
    ctx.ui.notify(buildCurrentThinkingLevelMessage(pi.getThinkingLevel(), availableLevels), 'info');
    return;
  }

  if (!isThinkingLevel(requestedLevel) || !availableLevels.includes(requestedLevel)) {
    ctx.ui.notify(buildUsageMessage(availableLevels), 'warning');
    return;
  }

  pi.setThinkingLevel(requestedLevel);
  ctx.ui.notify(`Thinking level: ${requestedLevel}`, 'info');
}

export function getThinkingLevelArgumentCompletions(
  prefix: string,
  model: ThinkingModel | undefined
): AutocompleteItem[] {
  const normalizedPrefix = prefix.trim().toLowerCase();

  return getAvailableThinkingLevels(model)
    .filter((level) => level.startsWith(normalizedPrefix))
    .map((level) => ({
      value: level,
      label: level,
      description: THINKING_LEVEL_DESCRIPTIONS[level],
    }));
}

export function getAvailableThinkingLevels(model: ThinkingModel | undefined): ThinkingLevel[] {
  if (!model?.reasoning) return ['off'];

  return supportsXhighThinking(model) ? XHIGH_THINKING_LEVELS : STANDARD_THINKING_LEVELS;
}

function isThinkingLevel(value: string): value is ThinkingLevel {
  return XHIGH_THINKING_LEVELS.includes(value as ThinkingLevel);
}

function supportsXhighThinking(model: ThinkingModel): boolean {
  return (
    includesAny(model.id, ['gpt-5.2', 'gpt-5.3', 'gpt-5.4', 'gpt-5.5', 'deepseek-v4-pro']) ||
    includesAny(model.id, ['opus-4-6', 'opus-4.6', 'opus-4-7', 'opus-4.7'])
  );
}

function includesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function buildCurrentThinkingLevelMessage(
  currentLevel: ThinkingLevel,
  availableLevels: ThinkingLevel[]
): string {
  return `Current thinking level: ${currentLevel}. Available levels: ${availableLevels.join(', ')}.`;
}

function buildUsageMessage(availableLevels: ThinkingLevel[]): string {
  return `Usage: /thinkinglevel ${availableLevels.join('|')}`;
}
