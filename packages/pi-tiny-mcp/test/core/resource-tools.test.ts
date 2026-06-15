import { describe, expect, it, vi } from 'vitest';

import { transformMcpContent } from '#pi-tiny-mcp/core/content.js';
import { TinyMcpRuntime } from '#pi-tiny-mcp/core/runtime.js';
import { buildToolMetadata } from '#pi-tiny-mcp/core/tool-metadata.js';
import type { McpResource, McpTool } from '#pi-tiny-mcp/core/types.js';
import { createTinyMcpConfig } from '#test/utils/config-test-helpers.js';

describe('resource tool metadata', () => {
  it('converts resources to zero-argument tool metadata', () => {
    // Arrange
    const resources: McpResource[] = [
      {
        name: 'Project README',
        uri: 'file:///repo/README.md',
        description: 'Repository overview',
      },
    ];

    // Act
    const metadata = buildToolMetadata([], resources, {}, 'docs', 'server');

    // Assert
    expect(metadata).toEqual([
      {
        name: 'docs_get_project_readme',
        originalName: 'get_project_readme',
        serverName: 'docs',
        description: 'Repository overview',
        resourceUri: 'file:///repo/README.md',
      },
    ]);
  });

  it('can suppress resource tools per server', () => {
    // Arrange
    const resources: McpResource[] = [{ name: 'README', uri: 'file:///repo/README.md' }];

    // Act
    const metadata = buildToolMetadata([], resources, { exposeResources: false }, 'docs', 'server');

    // Assert
    expect(metadata).toEqual([]);
  });

  it('applies resource tool exclusions to base names and prefixed names', () => {
    // Arrange
    const resources: McpResource[] = [
      { name: 'README', uri: 'file:///repo/README.md' },
      { name: 'API Docs', uri: 'file:///repo/API.md' },
    ];

    // Act
    const excludedByBaseName = buildToolMetadata([], resources, { excludeTools: ['get_readme'] }, 'docs', 'server');
    const excludedByPrefixedName = buildToolMetadata(
      [],
      resources,
      { excludeTools: ['docs_get_api_docs'] },
      'docs',
      'server'
    );

    // Assert
    expect(excludedByBaseName.map((tool) => tool.name)).toEqual(['docs_get_api_docs']);
    expect(excludedByPrefixedName.map((tool) => tool.name)).toEqual(['docs_get_readme']);
  });

  it('resolves resource collisions with deterministic URI suffixes', () => {
    // Arrange
    const tools: McpTool[] = [{ name: 'get_docs', description: 'Native docs tool' }];
    const resources: McpResource[] = [
      { name: 'Docs', uri: 'file:///repo/README.md' },
      { name: 'Docs', uri: 'file:///repo/API.md' },
      { name: 'docs', uri: 'file:///repo/guides/intro.md' },
    ];

    // Act
    const metadata = buildToolMetadata(tools, resources, {}, 'server', 'none');

    // Assert
    expect(metadata.map((tool) => tool.name)).toEqual([
      'get_docs',
      'get_docs_repo_readme_md',
      'get_docs_repo_api_md',
      'get_docs_guides_intro_md',
    ]);
    expect(metadata.map((tool) => tool.resourceUri)).toEqual([
      undefined,
      'file:///repo/README.md',
      'file:///repo/API.md',
      'file:///repo/guides/intro.md',
    ]);
  });
});

describe('resource result rendering', () => {
  it('renders text and binary resource contents with metadata', () => {
    // Act
    const content = transformMcpContent([
      { uri: 'file:///repo/README.md', mimeType: 'text/markdown', text: '# README' },
      { uri: 'file:///repo/image.png', mimeType: 'image/png', blob: 'aGVsbG8=' },
    ]);

    // Assert
    expect(content).toEqual([
      {
        type: 'text',
        text: 'Resource: file:///repo/README.md\nMIME type: text/markdown\n\n# README',
      },
      {
        type: 'text',
        text: 'Resource: file:///repo/image.png\nMIME type: image/png\n\n[Binary resource: image/png, 5 bytes]',
      },
    ]);
  });

  it('returns resource call details with content count and MIME types', async () => {
    // Arrange
    const runtime = new TinyMcpRuntime(
      createTinyMcpConfig({ servers: { docs: { command: 'npx' } }, metadataCache: { enabled: false } })
    );
    runtime.metadataByServer.set('docs', [
      {
        name: 'docs_get_readme',
        originalName: 'get_readme',
        serverName: 'docs',
        description: 'Read resource',
        resourceUri: 'file:///repo/README.md',
      },
    ]);
    vi.spyOn(runtime.manager, 'connect').mockResolvedValue({
      tools: [],
      resources: [],
    } as never);
    vi.spyOn(runtime.manager, 'readResource').mockResolvedValue({
      contents: [{ uri: 'file:///repo/README.md', mimeType: 'text/markdown', text: '# README' }],
    });

    // Act
    const result = await runtime.callToolWithArgs('docs_get_readme', {});

    // Assert
    expect(result.content).toEqual([
      {
        type: 'text',
        text: 'Resource: file:///repo/README.md\nMIME type: text/markdown\n\n# README',
      },
    ]);
    expect(result.details).toEqual({
      mode: 'resource',
      server: 'docs',
      tool: 'docs_get_readme',
      uri: 'file:///repo/README.md',
      contentCount: 1,
      mimeTypes: ['text/markdown'],
    });
  });
});
