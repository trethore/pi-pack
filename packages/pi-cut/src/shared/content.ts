import type { ToolResultEvent } from '@earendil-works/pi-coding-agent';

export function transformTextContent(
  content: ToolResultEvent['content'],
  transform: (text: string) => string
): ToolResultEvent['content'] {
  const firstChange = findFirstTextChange(content, transform);
  if (firstChange === undefined) return content;

  const transformedContent = content.slice(0, firstChange.index);
  transformedContent.push(firstChange.item);
  appendTransformedItems(transformedContent, content, firstChange.index + 1, transform);
  return transformedContent;
}

type ContentItem = ToolResultEvent['content'][number];

function findFirstTextChange(
  content: ToolResultEvent['content'],
  transform: (text: string) => string
): { index: number; item: ContentItem } | undefined {
  for (const [index, item] of content.entries()) {
    const transformedItem = transformContentItem(item, transform);
    if (transformedItem !== item) return { index, item: transformedItem };
  }

  return undefined;
}

function appendTransformedItems(
  transformedContent: ToolResultEvent['content'],
  content: ToolResultEvent['content'],
  startIndex: number,
  transform: (text: string) => string
): void {
  for (let index = startIndex; index < content.length; index += 1) {
    transformedContent.push(transformContentItem(content[index]!, transform));
  }
}

function transformContentItem(item: ContentItem, transform: (text: string) => string): ContentItem {
  if (item.type !== 'text') return item;
  const text = transform(item.text);
  return text === item.text ? item : { ...item, text };
}
