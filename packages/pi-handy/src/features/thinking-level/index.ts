import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import type { AutocompleteItem } from '@earendil-works/pi-tui';

type ThinkingLevel = Parameters<ExtensionAPI['setThinkingLevel']>[0];

type ThinkingLevelMap = Partial<Record<ThinkingLevel, string | null>>;

type ThinkingModel = {
  id: string;
  reasoning?: unknown;
  thinkingLevelMap?: ThinkingLevelMap;
};

const THINKING_LEVELS: ThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'];

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

  return THINKING_LEVELS.filter((level) => isLevelSupportedByModel(model, level));
}

function isThinkingLevel(value: string): value is ThinkingLevel {
  return THINKING_LEVELS.includes(value as ThinkingLevel);
}

function isLevelSupportedByModel(model: ThinkingModel, level: ThinkingLevel): boolean {
  const mappedLevel = model.thinkingLevelMap?.[level];

  if (mappedLevel === null) return false;
  if (level === 'xhigh') return mappedLevel !== undefined;

  return true;
}

function buildCurrentThinkingLevelMessage(currentLevel: ThinkingLevel, availableLevels: ThinkingLevel[]): string {
  return `Current thinking level: ${currentLevel}. Available levels: ${availableLevels.join(', ')}.`;
}

function buildUsageMessage(availableLevels: ThinkingLevel[]): string {
  return `Usage: /thinkinglevel ${availableLevels.join('|')}`;
}
