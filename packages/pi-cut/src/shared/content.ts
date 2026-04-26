import type { ToolResultEvent } from '@mariozechner/pi-coding-agent';

export function transformTextContent(
  content: ToolResultEvent['content'],
  transform: (text: string) => string
): ToolResultEvent['content'] {
  let transformedContent: ToolResultEvent['content'] | undefined;

  for (const [index, item] of content.entries()) {
    if (item.type !== 'text') {
      transformedContent?.push(item);
      continue;
    }

    const text = transform(item.text);
    if (text === item.text) {
      transformedContent?.push(item);
      continue;
    }

    transformedContent ??= content.slice(0, index);
    transformedContent.push({ ...item, text });
  }

  return transformedContent ?? content;
}
