import type {
  ResponsesInputContentItem,
  ResponsesInputItem,
  ResponsesInputMessageItem,
} from '#pi-codexify/features/openai-compaction/core/serializer.js';
import {
  cloneStructuredValue as cloneSharedStructuredValue,
  isRecord,
} from '#pi-codexify/features/openai-compaction/core/structured.js';

export function isResponsesInputContentItem(value: unknown): value is ResponsesInputContentItem {
  if (!isRecord(value) || typeof value['type']! !== 'string') return false;
  if (value['type'] === 'input_text') return typeof value['text']! === 'string';
  if (value['type'] === 'input_image') return value['detail'] === 'auto' && typeof value['image_url']! === 'string';
  if (value['type'] === 'encrypted_content') return typeof value['encrypted_content']! === 'string';
  return false;
}

export function isResponsesInputMessageRole(value: unknown): value is ResponsesInputMessageItem['role'] {
  return value === 'user' || value === 'developer' || value === 'system';
}

export function isPreambleRole(value: ResponsesInputMessageItem['role']): value is 'developer' | 'system' {
  return value === 'developer' || value === 'system';
}

export function isResponsesInputMessageItem(value: unknown): value is ResponsesInputMessageItem {
  if (!isRecord(value) || !isResponsesInputMessageRole(value['role']!)) return false;
  const { content } = value;
  return (
    typeof content === 'string' ||
    (Array.isArray(content) && content.every((item) => isResponsesInputContentItem(item)))
  );
}

function cloneResponsesInputContentItem(item: ResponsesInputContentItem): ResponsesInputContentItem {
  if (item.type === 'input_text') return { type: 'input_text', text: item.text };
  if (item.type === 'encrypted_content')
    return { type: 'encrypted_content', encrypted_content: item.encrypted_content };
  return { type: 'input_image', detail: 'auto', image_url: item.image_url };
}

export function cloneResponsesInputMessageItem(item: ResponsesInputMessageItem): ResponsesInputMessageItem {
  return {
    role: item.role,
    content:
      typeof item.content === 'string'
        ? item.content
        : item.content.map((content) => cloneResponsesInputContentItem(content)),
  };
}

export function cloneStructuredValue(value: unknown): unknown {
  return cloneSharedStructuredValue(value, { allowUndefined: true });
}

export function cloneOpaqueCompactedWindow(compactedWindow: readonly unknown[]): unknown[] | undefined {
  const cloned: unknown[] = [];
  for (const item of compactedWindow) {
    if (!isRecord(item)) return undefined;
    try {
      cloned.push(cloneStructuredValue(item));
    } catch {
      return undefined;
    }
  }
  return cloned;
}

export function cloneResponsesInputSlice(items: readonly unknown[]): ResponsesInputItem[] | undefined {
  const cloned: ResponsesInputItem[] = [];
  for (const item of items) {
    try {
      cloned.push(cloneStructuredValue(item) as ResponsesInputItem);
    } catch {
      return undefined;
    }
  }
  return cloned;
}

export function areEquivalentValues(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) return areEquivalentArrays(left, right);
  if (isRecord(left) || isRecord(right)) return areEquivalentRecords(left, right);
  return false;
}

function areEquivalentArrays(left: unknown, right: unknown): boolean {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((item, index) => areEquivalentValues(item, right[index]));
}

function areEquivalentRecords(left: unknown, right: unknown): boolean {
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (!areEquivalentArrays(leftKeys, rightKeys)) return false;
  return leftKeys.every((key) => areEquivalentValues(left[key], right[key]));
}
