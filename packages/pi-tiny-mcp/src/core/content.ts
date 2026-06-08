import type { McpContent, McpResourceContent } from '#src/core/types.js';

type ContentBlock = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };

type TransformableContent = McpContent | McpResourceContent;

export function transformMcpContent(content: TransformableContent[] | undefined): ContentBlock[] {
  if (!content || content.length === 0) {
    return [{ type: 'text', text: '(empty MCP result)' }];
  }

  return content.map((item) => {
    if (isResourceReadContent(item)) return toTextContent(formatResourceReadContent(item));
    if (item.type === 'text') return { type: 'text' as const, text: item.text ?? '' };
    if (item.type === 'image') return toImageContent(item);
    if (item.type === 'resource') return toTextContent(formatEmbeddedResourceContent(item));
    if (item.type === 'resource_link') return toTextContent(formatResourceLink(item));
    if (item.type === 'audio') return toTextContent(`[Audio content: ${item.mimeType ?? 'audio/*'}]`);
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

function formatEmbeddedResourceContent(item: McpContent): string {
  return formatResourcePayload({
    uri: item.resource?.uri ?? '(no URI)',
    text: item.resource?.text,
    blob: item.resource?.blob,
    mimeType: item.resource?.mimeType ?? item.mimeType,
  });
}

function formatResourceReadContent(item: McpResourceContent): string {
  return formatResourcePayload(item);
}

function formatResourcePayload(item: McpResourceContent): string {
  const lines = [`Resource: ${item.uri}`];
  if (item.mimeType) lines.push(`MIME type: ${item.mimeType}`);
  lines.push('');

  if (item.text !== undefined) return [...lines, item.text].join('\n');
  if (item.blob !== undefined) {
    const size = Buffer.byteLength(item.blob, 'base64');
    return [...lines, `[Binary resource: ${item.mimeType ?? 'application/octet-stream'}, ${size} bytes]`].join('\n');
  }
  return [...lines, '(empty resource)'].join('\n');
}

function formatResourceLink(item: McpContent): string {
  const name = item.name ?? item.uri ?? 'unknown';
  const uri = item.uri ?? '(no URI)';
  return `Resource link: ${name}\nURI: ${uri}`;
}

function isResourceReadContent(item: TransformableContent): item is McpResourceContent {
  return !('type' in item) && typeof item.uri === 'string';
}
