import { describe, expect, it } from 'vitest';

import { transformMcpContent } from '#pi-tiny-mcp/core/content.js';
import type { McpContent, McpResourceContent } from '#pi-tiny-mcp/core/types.js';

describe('transformMcpContent', () => {
  it.each([undefined, []])('returns an empty result marker for %j', (content) => {
    expect(transformMcpContent(content)).toEqual([{ type: 'text', text: '(empty MCP result)' }]);
  });

  it('renders text, images, audio, and unknown content with defaults', () => {
    const content = [
      { type: 'text' },
      { type: 'image' },
      { type: 'image', data: 'image-data', mimeType: 'image/webp' },
      { type: 'audio' },
      { type: 'audio', mimeType: 'audio/wav' },
      { type: 'unknown', value: 1 },
    ] as unknown as McpContent[];

    expect(transformMcpContent(content)).toEqual([
      { type: 'text', text: '' },
      { type: 'image', data: '', mimeType: 'image/png' },
      { type: 'image', data: 'image-data', mimeType: 'image/webp' },
      { type: 'text', text: '[Audio content: audio/*]' },
      { type: 'text', text: '[Audio content: audio/wav]' },
      { type: 'text', text: '{"type":"unknown","value":1}' },
    ]);
  });

  it('renders embedded resources with text, binary, and empty payloads', () => {
    const content: McpContent[] = [
      {
        type: 'resource',
        resource: { uri: 'file:///text.txt', text: 'hello', mimeType: 'text/plain' },
      },
      {
        type: 'resource',
        mimeType: 'application/custom',
        resource: { uri: 'file:///binary.bin', blob: 'aGVsbG8=' },
      },
      { type: 'resource' },
    ];

    expect(transformMcpContent(content)).toEqual([
      { type: 'text', text: 'Resource: file:///text.txt\nMIME type: text/plain\n\nhello' },
      {
        type: 'text',
        text: 'Resource: file:///binary.bin\nMIME type: application/custom\n\n[Binary resource: application/custom, 5 bytes]',
      },
      { type: 'text', text: 'Resource: (no URI)\n\n(empty resource)' },
    ]);
  });

  it('renders direct resource contents with binary and empty defaults', () => {
    const content: McpResourceContent[] = [{ uri: 'file:///binary.bin', blob: 'aGk=' }, { uri: 'file:///empty.txt' }];

    expect(transformMcpContent(content)).toEqual([
      {
        type: 'text',
        text: 'Resource: file:///binary.bin\n\n[Binary resource: application/octet-stream, 2 bytes]',
      },
      { type: 'text', text: 'Resource: file:///empty.txt\n\n(empty resource)' },
    ]);
  });

  it('renders resource links with complete and missing metadata', () => {
    const content: McpContent[] = [
      { type: 'resource_link', name: 'README', uri: 'file:///README.md' },
      { type: 'resource_link', uri: 'file:///fallback.md' },
      { type: 'resource_link' },
    ];

    expect(transformMcpContent(content)).toEqual([
      { type: 'text', text: 'Resource link: README\nURI: file:///README.md' },
      { type: 'text', text: 'Resource link: file:///fallback.md\nURI: file:///fallback.md' },
      { type: 'text', text: 'Resource link: unknown\nURI: (no URI)' },
    ]);
  });
});
