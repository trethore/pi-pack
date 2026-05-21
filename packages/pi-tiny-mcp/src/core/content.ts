import type { McpContent } from '#src/core/types.js';

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

export function transformMcpContent(content: McpContent[] | undefined): ContentBlock[] {
  if (!content || content.length === 0) {
    return [{ type: 'text', text: '(empty MCP result)' }];
  }

  return content.map((item) => {
    if (item.type === 'text') return { type: 'text' as const, text: item.text ?? '' };
    if (item.type === 'image') return toImageContent(item);
    if (item.type === 'resource') return toTextContent(formatResourceContent(item));
    if (item.type === 'resource_link') return toTextContent(formatResourceLink(item));
    if (item.type === 'audio')
      return toTextContent(`[Audio content: ${item.mimeType ?? 'audio/*'}]`);
    return toTextContent(JSON.stringify(item));
  });
}

function toImageContent(item: McpContent) {
  return {
    type: 'image' as const,
    data: item.data ?? '',
    mimeType: item.mimeType ?? 'image/png',
  };
}

function toTextContent(text: string) {
  return { type: 'text' as const, text };
}

function formatResourceContent(item: McpContent): string {
  const uri = item.resource?.uri ?? '(no URI)';
  const content = item.resource?.text ?? JSON.stringify(item.resource ?? {});
  return `[Resource: ${uri}]\n${content}`;
}

function formatResourceLink(item: McpContent): string {
  const name = item.name ?? item.uri ?? 'unknown';
  const uri = item.uri ?? '(no URI)';
  return `[Resource Link: ${name}]\nURI: ${uri}`;
}
