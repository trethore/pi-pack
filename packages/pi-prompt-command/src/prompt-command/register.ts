import path from 'node:path';
import type { ExtensionAPI, ToolResultEvent } from '@earendil-works/pi-coding-agent';
import type { PiPromptCommandConfig } from '#src/config/schema.js';
import { replaceCommandPlaceholders } from '#src/prompt-command/placeholder.js';

interface TextContentBlock {
  type: string;
  text?: string;
}

interface SessionLike {
  getSessionId(): string;
  getBranch(): Array<{ type: string }>;
}

type MutableMessage = Record<string, unknown>;

export function registerPromptCommand(pi: ExtensionAPI, config: PiPromptCommandConfig) {
  const commandCache = new Map<string, Promise<string>>();
  const messageCache = new Map<string, string>();
  const systemPromptCache = new Map<string, string>();
  const skillPathsBySession = new Map<string, Set<string>>();
  let pendingExpandedMessage = false;

  pi.on('input', (event) => {
    pendingExpandedMessage = shouldProcessExpandedInput(event.text, config);
  });

  pi.on('session_shutdown', () => {
    commandCache.clear();
    messageCache.clear();
    systemPromptCache.clear();
    skillPathsBySession.clear();
  });

  pi.on('before_agent_start', async (event, ctx) => {
    commandCache.clear();

    const sessionId = ctx.sessionManager.getSessionId();
    rememberSkillPaths(skillPathsBySession, sessionId, event.systemPromptOptions.skills);

    if (systemPromptCache.has(sessionId)) {
      return { systemPrompt: systemPromptCache.get(sessionId)! };
    }
    if (!isFirstAgentTurn(ctx.sessionManager)) return;

    const systemPrompt = await processSystemPrompt(event.systemPrompt, event.systemPromptOptions, {
      executor: pi,
      config,
      cwd: ctx.cwd,
      signal: ctx.signal,
      cache: commandCache,
    });

    if (systemPrompt === event.systemPrompt) return;
    systemPromptCache.set(sessionId, systemPrompt);
    return { systemPrompt };
  });

  pi.on('context', async (event, ctx) => {
    if (!config.surfaces.promptTemplates && !config.surfaces.skills) return;

    const originalMessages = event.messages as unknown as MutableMessage[];
    const messages = await processContextMessages(originalMessages, {
      pi,
      config,
      cwd: ctx.cwd,
      signal: ctx.signal,
      commandCache,
      messageCache,
      shouldProcessLatest: pendingExpandedMessage,
    });
    pendingExpandedMessage = false;

    if (messages === originalMessages) return;
    return { messages: messages as unknown as typeof event.messages };
  });

  pi.on(
    'tool_result',
    async (event, ctx): Promise<{ content: ToolResultEvent['content'] } | undefined> => {
      if (!config.surfaces.skills || event.toolName !== 'read' || event.isError) return;

      const skillPaths = skillPathsBySession.get(ctx.sessionManager.getSessionId());
      if (!skillPaths || !isSkillRead(event.input.path, skillPaths, ctx.cwd)) return;

      const content = await replaceContentText(event.content, {
        executor: pi,
        config,
        cwd: ctx.cwd,
        signal: ctx.signal,
        cache: commandCache,
      });

      if (content === event.content) return;
      return { content };
    }
  );
}

async function processSystemPrompt(
  systemPrompt: string,
  options: {
    customPrompt?: string;
    appendSystemPrompt?: string;
    contextFiles?: Array<{ path: string; content: string }>;
  },
  replacementOptions: Parameters<typeof replaceCommandPlaceholders>[1]
): Promise<string> {
  let result = systemPrompt;

  if (replacementOptions.config.surfaces.system && options.customPrompt) {
    result = await replaceSourceText(result, options.customPrompt, replacementOptions);
  }

  if (replacementOptions.config.surfaces.appendSystem && options.appendSystemPrompt) {
    result = await replaceSourceText(result, options.appendSystemPrompt, replacementOptions);
  }

  if (replacementOptions.config.surfaces.contextFiles && options.contextFiles) {
    for (const contextFile of options.contextFiles) {
      result = await replaceSourceText(result, contextFile.content, replacementOptions);
    }
  }

  return result;
}

async function replaceSourceText(
  systemPrompt: string,
  sourceText: string,
  options: Parameters<typeof replaceCommandPlaceholders>[1]
): Promise<string> {
  if (!systemPrompt.includes(sourceText)) return systemPrompt;

  const replacement = await replaceCommandPlaceholders(sourceText, options);
  return systemPrompt.replaceAll(sourceText, replacement);
}

async function processContextMessages(
  messages: MutableMessage[],
  options: {
    pi: ExtensionAPI;
    config: PiPromptCommandConfig;
    cwd: string;
    signal: AbortSignal | undefined;
    commandCache: Map<string, Promise<string>>;
    messageCache: Map<string, string>;
    shouldProcessLatest: boolean;
  }
): Promise<MutableMessage[]> {
  const latestProcessableIndex = options.shouldProcessLatest
    ? findLastProcessableUserMessageIndex(messages)
    : -1;
  const processedMessages = await Promise.all(
    messages.map((message, index) =>
      processContextMessage(message, index === latestProcessableIndex, options)
    )
  );

  if (processedMessages.every((message, index) => message === messages[index])) return messages;
  return processedMessages;
}

async function processContextMessage(
  message: MutableMessage,
  shouldProcess: boolean,
  options: {
    pi: ExtensionAPI;
    config: PiPromptCommandConfig;
    cwd: string;
    signal: AbortSignal | undefined;
    commandCache: Map<string, Promise<string>>;
    messageCache: Map<string, string>;
  }
): Promise<MutableMessage> {
  if (message.role !== 'user') return message;

  const text = getUserText(message);
  if (text === undefined) return message;

  const cacheKey = getMessageCacheKey(message, text);
  const cached = options.messageCache.get(cacheKey);
  const processedText =
    cached ?? (shouldProcess ? await processUserText(text, cacheKey, options) : undefined);

  if (processedText === undefined || processedText === text) return message;
  return replaceUserText(message, processedText);
}

async function processUserText(
  text: string,
  cacheKey: string,
  options: {
    pi: ExtensionAPI;
    config: PiPromptCommandConfig;
    cwd: string;
    signal: AbortSignal | undefined;
    commandCache: Map<string, Promise<string>>;
    messageCache: Map<string, string>;
  }
): Promise<string> {
  const processed = await replaceCommandPlaceholders(text, {
    executor: options.pi,
    config: options.config,
    cwd: options.cwd,
    signal: options.signal,
    cache: options.commandCache,
  });
  options.messageCache.set(cacheKey, processed);
  return processed;
}

async function replaceContentText(
  content: ToolResultEvent['content'],
  options: Parameters<typeof replaceCommandPlaceholders>[1]
): Promise<ToolResultEvent['content']> {
  let changed = false;
  const replaced = await Promise.all(
    content.map(async (block) => {
      if (!isTextContentBlock(block) || block.text === undefined) return block;

      const text = await replaceCommandPlaceholders(block.text, options);
      if (text === block.text) return block;

      changed = true;
      return { ...block, text };
    })
  );

  return changed ? replaced : content;
}

function rememberSkillPaths(
  skillPathsBySession: Map<string, Set<string>>,
  sessionId: string,
  skills: Array<{ filePath: string }> | undefined
) {
  if (!skills) return;
  skillPathsBySession.set(sessionId, new Set(skills.map((skill) => path.resolve(skill.filePath))));
}

function isFirstAgentTurn(sessionManager: SessionLike): boolean {
  return !sessionManager.getBranch().some((entry) => isContextEntry(entry.type));
}

function isContextEntry(type: string): boolean {
  return (
    type === 'message' ||
    type === 'custom_message' ||
    type === 'compaction' ||
    type === 'branch_summary'
  );
}

function isSkillRead(inputPath: unknown, skillPaths: Set<string>, cwd: string): boolean {
  if (typeof inputPath !== 'string') return false;
  return skillPaths.has(path.resolve(cwd, inputPath));
}

function shouldProcessExpandedInput(text: string, config: PiPromptCommandConfig): boolean {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith('/')) return false;
  if (trimmed.startsWith('/skill:')) return config.surfaces.skills;
  return config.surfaces.promptTemplates;
}

function findLastProcessableUserMessageIndex(messages: MutableMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].role === 'user' && getUserText(messages[index])?.includes('!`'))
      return index;
  }
  return -1;
}

function getUserText(message: MutableMessage): string | undefined {
  const content = message.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return undefined;

  const textBlocks = content.filter(isTextContentBlock);
  if (textBlocks.length !== 1) return undefined;
  return textBlocks[0].text;
}

function replaceUserText(message: MutableMessage, text: string): MutableMessage {
  const content = message.content;
  if (typeof content === 'string') return { ...message, content: text };
  if (!Array.isArray(content)) return message;

  return {
    ...message,
    content: content.map((block) => (isTextContentBlock(block) ? { ...block, text } : block)),
  };
}

function isTextContentBlock(value: unknown): value is TextContentBlock {
  return typeof value === 'object' && value !== null && (value as TextContentBlock).type === 'text';
}

function getMessageCacheKey(message: MutableMessage, text: string): string {
  return `${String(message.timestamp ?? '')}\0${text}`;
}
