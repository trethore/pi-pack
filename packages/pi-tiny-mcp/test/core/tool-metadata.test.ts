import { describe, expect, it } from 'vitest';

import { buildToolMetadata, findToolByName, formatSchema } from '#pi-tiny-mcp/core/tool-metadata.js';
import type { McpResource, McpTool, ToolMetadata } from '#pi-tiny-mcp/core/types.js';

describe('buildToolMetadata', () => {
  it('filters invalid and excluded tools while preserving metadata defaults', () => {
    const tools = [
      { name: '', description: 'invalid' },
      { name: 'excluded', description: 'excluded' },
      { name: 'search' },
    ] satisfies McpTool[];

    const metadata = buildToolMetadata(tools, [], { excludeTools: ['server_excluded'] }, 'server', 'server');

    expect(metadata).toEqual([
      {
        name: 'server_search',
        originalName: 'search',
        serverName: 'server',
        description: '',
        inputSchema: undefined,
      },
    ]);
  });

  it('filters invalid resources and supplies a default description', () => {
    const resources = [
      { name: '', uri: 'file:///missing-name' },
      { name: 'Missing URI', uri: '' },
      { name: 'README', uri: 'file:///README.md' },
    ] satisfies McpResource[];

    const metadata = buildToolMetadata([], resources, {}, 'docs', 'none');

    expect(metadata).toEqual([
      {
        name: 'get_readme',
        originalName: 'get_readme',
        serverName: 'docs',
        description: 'Read resource: file:///README.md',
        resourceUri: 'file:///README.md',
      },
    ]);
  });

  it('uses numeric suffixes when duplicate names cannot use a resource suffix', () => {
    const tools: McpTool[] = [{ name: 'search' }, { name: 'search' }, { name: 'search_2' }, { name: 'search' }];

    const metadata = buildToolMetadata(tools, [], {}, 'server', 'none');

    expect(metadata.map((tool) => tool.name)).toEqual(['search', 'search_2', 'search_2_1', 'search_3']);
  });

  it('treats hyphens and underscores as duplicate names', () => {
    const tools: McpTool[] = [{ name: 'search-tool' }, { name: 'search_tool' }];

    const metadata = buildToolMetadata(tools, [], {}, 'server', 'none');

    expect(metadata.map((tool) => tool.name)).toEqual(['search-tool', 'search_tool_2']);
  });
});

describe('findToolByName', () => {
  const metadata: ToolMetadata[] = [
    {
      name: 'github-search',
      originalName: 'search',
      serverName: 'github',
      description: 'Search GitHub',
    },
  ];

  it.each([
    { name: 'github-search', expected: metadata[0] },
    { name: 'github_search', expected: metadata[0] },
    { name: 'missing', expected: undefined },
  ])('finds $name with exact and normalized matching', ({ name, expected }) => {
    const metadataByServer = new Map<string, ToolMetadata[]>([
      ['empty', []],
      ['github', metadata],
    ]);

    expect(findToolByName(metadataByServer, name)).toBe(expected);
  });
});

describe('formatSchema', () => {
  it.each([
    { schema: undefined, expected: '  (no schema)' },
    { schema: 'string', expected: '  (no schema)' },
    { schema: { type: 'string' }, expected: '  (string)' },
    { schema: { anyOf: [] }, expected: '  (complex schema)' },
    { schema: { type: 'object', properties: [] }, expected: '  (object)' },
    { schema: { type: 'object', properties: {} }, expected: '  (no parameters)' },
  ])('formats schema variants', ({ schema, expected }) => {
    expect(formatSchema(schema)).toBe(expected);
  });

  it('formats property types, requirements, descriptions, and defaults', () => {
    const schema = {
      type: 'object',
      required: ['query', 'raw'],
      properties: {
        query: { type: 'string', description: 'Search query', default: '' },
        mode: { enum: ['fast', 'full'] },
        value: { type: ['string', 'number'] },
        choice: { oneOf: [{ type: 'string' }, { type: 'number' }] },
        fallback: { anyOf: [{ type: 'boolean' }] },
        unknown: {},
        raw: 'untyped',
      },
    };

    expect(formatSchema(schema, '--')).toBe(
      [
        '--query (string) *required* - Search query [default: ""]',
        '--mode (enum: "fast", "full")',
        '--value (string | number)',
        '--choice (union)',
        '--fallback (union)',
        '--unknown',
        '--raw *required*',
      ].join('\n')
    );
  });
});
