import type { Api, Context, Model, Tool } from '@earendil-works/pi-ai';
import { parseTextSignature, shortHash } from '#pi-codexify/features/openai-compaction/responses/signatures.js';
import {
  encryptedWebRunOutputFromDetails,
  imageDetailForResponses,
  isImageGenerationCallBlock,
  isWebSearchCallBlock,
  sanitizeImageGenerationCallItem,
  sanitizeWebSearchCallItem,
  type ImageDetail,
  type ImageGenerationCallBlock,
  type WebSearchCallBlock,
} from '#pi-codexify/features/openai-compaction/responses/native-items.js';

type Message = Context['messages'][number];
type AssistantMessage = Extract<Message, { role: 'assistant' }>;
type UserMessage = Extract<Message, { role: 'user' }>;
type ToolResultMessage = Extract<Message, { role: 'toolResult' }>;
type UserContent = Exclude<UserMessage['content'], string>;
type ToolCallBlock = Extract<AssistantMessage['content'][number], { type: 'toolCall' }>;

type InternalAssistantContent = AssistantMessage['content'][number] | ImageGenerationCallBlock | WebSearchCallBlock;
type ImageContentWithDetail = { type: 'image'; data: string; mimeType: string; detail?: ImageDetail | undefined };

type ResponseInput = Record<string, unknown>[];
type ResponseInputItem = ResponseInput[number];
type OpenAITool = Record<string, unknown>;

type ToolCallIdNormalizer = (id: string, targetModel: Model<Api>, source: AssistantMessage) => string;

interface ConvertResponsesMessagesOptions {
  includeSystemPrompt?: boolean | undefined;
}

interface ConvertResponsesToolsOptions {
  strict?: boolean | null | undefined;
}

export const CODEX_TOOL_CALL_PROVIDERS = new Set(['openai', 'openai-codex', 'opencode']);

function sanitizeSurrogates(text: string): string {
  return text.replaceAll(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}

function parseResponsesThinkingSignature(signature: string): ResponseInputItem | undefined {
  try {
    return JSON.parse(signature) as ResponseInputItem;
  } catch {
    return undefined;
  }
}

const NON_VISION_USER_IMAGE_PLACEHOLDER = '(image omitted: model does not support images)';
const NON_VISION_TOOL_IMAGE_PLACEHOLDER = '(tool image omitted: model does not support images)';

function replaceImagesWithPlaceholder(content: UserContent, placeholder: string): UserContent {
  const result: UserContent = [];
  let previousWasPlaceholder = false;
  for (const block of content) {
    if (block.type === 'image') {
      if (!previousWasPlaceholder) result.push({ type: 'text', text: placeholder });
      previousWasPlaceholder = true;
      continue;
    }
    result.push(block);
    previousWasPlaceholder = block.text === placeholder;
  }
  return result;
}

function downgradeUnsupportedImages(messages: Context['messages'], model: Model<Api>): Context['messages'] {
  if (model.input.includes('image')) return messages;
  return messages.map((message) => downgradeMessageImages(message));
}

function downgradeMessageImages(message: Message): Message {
  if (message.role === 'user' && Array.isArray(message.content)) {
    return { ...message, content: replaceImagesWithPlaceholder(message.content, NON_VISION_USER_IMAGE_PLACEHOLDER) };
  }
  if (message.role === 'toolResult') {
    return { ...message, content: replaceImagesWithPlaceholder(message.content, NON_VISION_TOOL_IMAGE_PLACEHOLDER) };
  }
  return message;
}

function isSameAssistantModel(message: AssistantMessage, model: Model<Api>): boolean {
  return message.provider === model.provider && message.api === model.api && message.model === model.id;
}

function transformThinkingBlock(
  block: Extract<AssistantMessage['content'][number], { type: 'thinking' }>,
  isSameModel: boolean
) {
  if (block.redacted) return isSameModel ? [block] : [];
  if (isSameModel && block.thinkingSignature) return [block];
  if (!block.thinking || block.thinking.trim() === '') return [];
  return isSameModel ? [block] : [{ type: 'text' as const, text: block.thinking }];
}

function transformToolCallBlock(
  block: ToolCallBlock,
  model: Model<Api>,
  message: AssistantMessage,
  isSameModel: boolean,
  normalizeToolCallId: ToolCallIdNormalizer | undefined,
  toolCallIdMap: Map<string, string>
): ToolCallBlock {
  const unsignedBlock = !isSameModel && block.thoughtSignature ? removeThoughtSignature(block) : block;
  if (isSameModel || !normalizeToolCallId) return unsignedBlock;

  const normalizedId = normalizeToolCallId(block.id, model, message);
  if (normalizedId === block.id) return unsignedBlock;

  toolCallIdMap.set(block.id, normalizedId);
  return { ...unsignedBlock, id: normalizedId };
}

function removeThoughtSignature(block: ToolCallBlock): ToolCallBlock {
  const normalizedToolCall = { ...block };
  delete normalizedToolCall.thoughtSignature;
  return normalizedToolCall;
}

function transformAssistantBlock(
  block: InternalAssistantContent,
  model: Model<Api>,
  message: AssistantMessage,
  normalizeToolCallId: ToolCallIdNormalizer | undefined,
  toolCallIdMap: Map<string, string>
): InternalAssistantContent[] {
  if (isImageGenerationCallBlock(block) || isWebSearchCallBlock(block)) return [block];

  const isSameModel = isSameAssistantModel(message, model);
  if (block.type === 'thinking') return transformThinkingBlock(block, isSameModel);
  if (block.type === 'text') return isSameModel ? [block] : [{ type: 'text', text: block.text }];
  if (block.type === 'toolCall') {
    return [transformToolCallBlock(block, model, message, isSameModel, normalizeToolCallId, toolCallIdMap)];
  }
  return [block];
}

function transformAssistantMessage(
  message: AssistantMessage,
  model: Model<Api>,
  normalizeToolCallId: ToolCallIdNormalizer | undefined,
  toolCallIdMap: Map<string, string>
): AssistantMessage {
  const content = (message.content as InternalAssistantContent[]).flatMap((block) =>
    transformAssistantBlock(block, model, message, normalizeToolCallId, toolCallIdMap)
  );
  return { ...message, content: content as AssistantMessage['content'] };
}

function transformMessage(
  message: Message,
  model: Model<Api>,
  normalizeToolCallId: ToolCallIdNormalizer | undefined,
  toolCallIdMap: Map<string, string>
): Message {
  if (message.role === 'assistant')
    return transformAssistantMessage(message, model, normalizeToolCallId, toolCallIdMap);
  if (message.role !== 'toolResult') return message;

  const normalizedId = toolCallIdMap.get(message.toolCallId);
  return normalizedId && normalizedId !== message.toolCallId ? { ...message, toolCallId: normalizedId } : message;
}

function createMissingToolResult(toolCall: ToolCallBlock): ToolResultMessage {
  return {
    role: 'toolResult',
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    content: [{ type: 'text', text: 'No result provided' }],
    isError: true,
    timestamp: Date.now(),
  } as ToolResultMessage;
}

function appendSyntheticToolResults(
  result: Context['messages'],
  pendingToolCalls: readonly ToolCallBlock[],
  existingToolResultIds: ReadonlySet<string>
): void {
  for (const toolCall of pendingToolCalls) {
    if (!existingToolResultIds.has(toolCall.id)) result.push(createMissingToolResult(toolCall));
  }
}

function transformMessages(
  messages: Context['messages'],
  model: Model<Api>,
  normalizeToolCallId?: ToolCallIdNormalizer | undefined
): Context['messages'] {
  const toolCallIdMap = new Map<string, string>();
  const transformed = downgradeUnsupportedImages(messages, model).map((message) =>
    transformMessage(message, model, normalizeToolCallId, toolCallIdMap)
  );

  return insertMissingToolResults(transformed);
}

function insertMissingToolResults(messages: Context['messages']): Context['messages'] {
  const result: Context['messages'] = [];
  let pendingToolCalls: ToolCallBlock[] = [];
  let existingToolResultIds = new Set<string>();

  for (const message of messages) {
    if (message.role === 'assistant') {
      appendSyntheticToolResults(result, pendingToolCalls, existingToolResultIds);
      pendingToolCalls = collectPendingToolCalls(message);
      existingToolResultIds = new Set();
      if (message.stopReason !== 'error' && message.stopReason !== 'aborted') result.push(message);
      continue;
    }
    if (message.role === 'toolResult') existingToolResultIds.add(message.toolCallId);
    if (message.role === 'user') appendSyntheticToolResults(result, pendingToolCalls, existingToolResultIds);
    if (message.role === 'user') pendingToolCalls = [];
    result.push(message);
  }

  appendSyntheticToolResults(result, pendingToolCalls, existingToolResultIds);
  return result;
}

function collectPendingToolCalls(message: AssistantMessage): ToolCallBlock[] {
  if (message.stopReason === 'error' || message.stopReason === 'aborted') return [];
  return message.content.filter((block): block is ToolCallBlock => block.type === 'toolCall');
}

function normalizeIdPart(part: string): string {
  const sanitized = part.replaceAll(/[^a-zA-Z0-9_-]/g, '_');
  const normalized = sanitized.length > 64 ? sanitized.slice(0, 64) : sanitized;
  return normalized.replace(/_+$/, '');
}

function buildForeignResponsesItemId(itemId: string): string {
  const normalized = `fc_${shortHash(itemId)}`;
  return normalized.length > 64 ? normalized.slice(0, 64) : normalized;
}

function normalizeResponsesToolCallId(
  id: string,
  model: Model<Api>,
  source: AssistantMessage,
  allowedToolCallProviders: ReadonlySet<string>
): string {
  if (!allowedToolCallProviders.has(model.provider)) return normalizeIdPart(id);
  if (!id.includes('|')) return normalizeIdPart(id);

  const [callId, itemId] = id.split('|') as [string, string | undefined];
  const normalizedCallId = normalizeIdPart(callId);
  const normalizedItemId = normalizeResponsesToolCallItemId(itemId ?? '', model, source);
  return `${normalizedCallId}|${normalizedItemId}`;
}

function normalizeResponsesToolCallItemId(itemId: string, model: Model<Api>, source: AssistantMessage): string {
  const isForeignToolCall = source.provider !== model.provider || source.api !== model.api;
  const normalizedItemId = isForeignToolCall ? buildForeignResponsesItemId(itemId) : normalizeIdPart(itemId);
  return normalizedItemId.startsWith('fc_') ? normalizedItemId : normalizeIdPart(`fc_${normalizedItemId}`);
}

function appendSystemPrompt(
  messages: ResponseInput,
  model: Model<Api>,
  context: Context,
  includeSystemPrompt: boolean
): void {
  if (!includeSystemPrompt || !context.systemPrompt) return;
  messages.push({
    role: model.reasoning ? 'developer' : 'system',
    content: sanitizeSurrogates(context.systemPrompt),
  });
}

export function convertResponsesMessages<TApi extends Api>(
  model: Model<TApi>,
  context: Context,
  allowedToolCallProviders: ReadonlySet<string>,
  options?: ConvertResponsesMessagesOptions
): ResponseInput {
  const messages: ResponseInput = [];
  const normalizeToolCallId = (id: string, _targetModel: Model<TApi>, source: AssistantMessage) =>
    normalizeResponsesToolCallId(id, model as Model<Api>, source, allowedToolCallProviders);
  const transformedMessages = transformMessages(context.messages, model as Model<Api>, normalizeToolCallId as never);

  appendSystemPrompt(messages, model, context, options?.includeSystemPrompt ?? true);
  for (const [index, message] of transformedMessages.entries()) {
    messages.push(...convertMessageToResponsesItems(model, message, index));
  }
  return messages;
}

function convertMessageToResponsesItems<TApi extends Api>(
  model: Model<TApi>,
  message: Message,
  messageIndex: number
): ResponseInput {
  if (message.role === 'user') return convertUserMessage(message);
  if (message.role === 'assistant') return convertAssistantMessage(model, message, messageIndex);
  if (message.role === 'toolResult') return [convertToolResultMessage(model, message)];
  return [];
}

function convertUserMessage(message: UserMessage): ResponseInput {
  if (typeof message.content === 'string') {
    return [{ role: 'user', content: [{ type: 'input_text', text: sanitizeSurrogates(message.content) }] }];
  }

  const content = message.content.map((item) =>
    item.type === 'text'
      ? { type: 'input_text' as const, text: sanitizeSurrogates(item.text) }
      : {
          type: 'input_image' as const,
          detail: imageDetailForResponses(item),
          image_url: `data:${item.mimeType};base64,${item.data}`,
        }
  );
  return content.length > 0 ? [{ role: 'user', content }] : [];
}

function convertAssistantMessage<TApi extends Api>(
  model: Model<TApi>,
  message: AssistantMessage,
  messageIndex: number
): ResponseInput {
  const output: ResponseInput = [];
  let textBlockIndex = 0;
  for (const block of message.content as InternalAssistantContent[]) {
    output.push(...convertAssistantBlock(model, message, block, messageIndex, textBlockIndex));
    if (block.type === 'text') textBlockIndex++;
  }
  return output;
}

function convertAssistantBlock<TApi extends Api>(
  model: Model<TApi>,
  message: AssistantMessage,
  block: InternalAssistantContent,
  messageIndex: number,
  textBlockIndex: number
): ResponseInput {
  if (isImageGenerationCallBlock(block)) return sanitizedNativeItem(sanitizeImageGenerationCallItem(block.item));
  if (isWebSearchCallBlock(block)) return sanitizedNativeItem(sanitizeWebSearchCallItem(block.item));
  if (block.type === 'thinking') return convertThinkingBlock(block);
  if (block.type === 'text') return [convertAssistantTextBlock(block, messageIndex, textBlockIndex)];
  if (block.type === 'toolCall') return [convertToolCallBlock(model, message, block)];
  return [];
}

function sanitizedNativeItem(item: object | undefined): ResponseInput {
  return item ? [item as ResponseInputItem] : [];
}

function convertThinkingBlock(
  block: Extract<AssistantMessage['content'][number], { type: 'thinking' }>
): ResponseInput {
  const thinkingItem = block.thinkingSignature ? parseResponsesThinkingSignature(block.thinkingSignature) : undefined;
  return thinkingItem ? [thinkingItem] : [];
}

function convertAssistantTextBlock(
  block: Extract<AssistantMessage['content'][number], { type: 'text' }>,
  messageIndex: number,
  blockIndex: number
): ResponseInputItem {
  const parsedSignature = parseTextSignature(block.textSignature);
  return {
    type: 'message',
    role: 'assistant',
    content: [{ type: 'output_text', text: sanitizeSurrogates(block.text), annotations: [] }],
    status: 'completed',
    id: buildAssistantMessageId(parsedSignature?.id, messageIndex, blockIndex),
    ...(parsedSignature?.phase ? { phase: parsedSignature.phase } : {}),
  };
}

function buildAssistantMessageId(parsedId: string | undefined, messageIndex: number, blockIndex: number): string {
  const fallbackMessageId = blockIndex === 0 ? `msg_pi_${messageIndex}` : `msg_pi_${messageIndex}_${blockIndex}`;
  const messageId = parsedId ?? fallbackMessageId;
  return messageId.length > 64 ? `msg_${shortHash(messageId)}` : messageId;
}

function convertToolCallBlock<TApi extends Api>(
  model: Model<TApi>,
  message: AssistantMessage,
  block: ToolCallBlock
): ResponseInputItem {
  const [callId, itemIdRaw] = block.id.split('|');
  const itemId = shouldKeepToolCallItemId(model, message, itemIdRaw) ? itemIdRaw : undefined;
  return {
    type: 'function_call',
    ...(itemId ? { id: itemId } : {}),
    call_id: callId,
    name: block.name,
    arguments: JSON.stringify(block.arguments),
  } as ResponseInputItem;
}

function shouldKeepToolCallItemId<TApi extends Api>(
  model: Model<TApi>,
  message: AssistantMessage,
  itemId: string | undefined
): boolean {
  const isDifferentModel =
    message.model !== model.id && message.provider === model.provider && message.api === model.api;
  return !(isDifferentModel && itemId?.startsWith('fc_'));
}

function convertToolResultMessage<TApi extends Api>(model: Model<TApi>, message: ToolResultMessage): ResponseInputItem {
  const textResult = message.content
    .filter((content) => content.type === 'text')
    .map((content) => content.text)
    .join('\n');
  const [callId] = message.toolCallId.split('|');
  const output = buildFunctionCallOutput(message, model as Model<Api>, textResult);
  return { type: 'function_call_output', call_id: callId!, output: output as unknown };
}

function buildFunctionCallOutput(message: ToolResultMessage, model: Model<Api>, textResult: string): unknown {
  const encryptedWebRunOutput = encryptedWebRunOutputFromDetails(message.details);
  if (encryptedWebRunOutput) return [{ type: 'encrypted_content' as const, encrypted_content: encryptedWebRunOutput }];
  if (!message.content.some((content) => content.type === 'image') || !model.input.includes('image')) {
    return sanitizeSurrogates(textResult.length > 0 ? textResult : '(see attached image)');
  }
  return buildImageAwareToolOutput(message, textResult);
}

function buildImageAwareToolOutput(message: ToolResultMessage, textResult: string) {
  return [
    ...(textResult.length > 0 ? [{ type: 'input_text' as const, text: sanitizeSurrogates(textResult) }] : []),
    ...message.content
      .filter((block): block is ImageContentWithDetail => block.type === 'image')
      .map((block) => ({
        type: 'input_image' as const,
        detail: imageDetailForResponses(block),
        image_url: `data:${block.mimeType};base64,${block.data}`,
      })),
  ];
}

export function convertResponsesTools(tools: Tool[], options?: ConvertResponsesToolsOptions): OpenAITool[] {
  const strict = options?.strict === undefined ? false : options.strict;
  return tools.map((tool) => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters as unknown as Record<string, unknown>,
    strict,
  }));
}
