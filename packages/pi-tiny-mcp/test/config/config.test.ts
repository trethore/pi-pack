import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { createConfigTestHelpers } from '@trethore/pi-shared/test/config-test-helpers.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { importConfigWithHome, makeTempDir, writeProjectConfig } = createConfigTestHelpers({
  configFileName: 'pi-tiny-mcp.jsonc',
  importConfig: () => import('#pi-tiny-mcp/config/config.js'),
  tempPrefix: 'pi-tiny-mcp-test-',
});

describe('loadConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('node:os');
    vi.resetModules();
  });

  it('loads tiny defaults when no config files exist', async () => {
    const loaded = await loadTinyConfigFromNewProject();

    expect(loaded.errors).toEqual([]);
    expect(loaded.config.proxyTool).toEqual({
      enabled: true,
      name: 'mcp',
      includeSchemasInSearch: true,
    });
    expect(loaded.config.directTools).toEqual({
      enabled: false,
      disableProxyTool: false,
    });
    expect(loaded.config.servers).toEqual({});
  });

  it('loads standard project MCP servers and lets pi config override them', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithHome(makeTempDir());
    const cwd = makeTempDir();
    writeFileSync(
      path.join(cwd, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          browser: { command: 'npx', args: ['-y', 'browser-mcp'], env: { TOKEN: '${TOKEN}' } },
        },
      })
    );
    writeProjectConfig(
      cwd,
      JSON.stringify({
        servers: {
          browser: { command: 'node', args: ['server.js'], lifecycle: 'eager' },
        },
      })
    );

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.servers.browser).toEqual({
      command: 'node',
      args: ['server.js'],
      env: { TOKEN: '${TOKEN}' },
      lifecycle: 'eager',
    });
  });

  it('can disable standard MCP sources', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithHome(makeTempDir());
    const cwd = makeTempDir();
    writeFileSync(path.join(cwd, '.mcp.json'), JSON.stringify({ mcpServers: { ignored: { command: 'npx' } } }));
    writeProjectConfig(cwd, JSON.stringify({ sources: { standardProject: false } }));

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.servers).toEqual({});
  });

  it('loads HTTP MCP server fields', async () => {
    const loaded = await loadProjectConfig({
      servers: {
        remote: {
          url: 'https://mcp.example.com/mcp',
          headers: { 'X-Api-Key': '${API_KEY}' },
          auth: 'bearer',
          bearerTokenEnv: 'MCP_TOKEN',
        },
      },
    });

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.servers.remote).toEqual({
      url: 'https://mcp.example.com/mcp',
      headers: { 'X-Api-Key': '${API_KEY}' },
      auth: 'bearer',
      bearerTokenEnv: 'MCP_TOKEN',
    });
  });

  it('loads OAuth HTTP MCP server fields', async () => {
    const loaded = await loadProjectConfig({
      servers: {
        remote: {
          url: 'https://mcp.example.com/mcp',
          auth: 'oauth',
        },
      },
    });

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.servers.remote).toEqual({
      url: 'https://mcp.example.com/mcp',
      auth: 'oauth',
    });
  });

  it('loads standard HTTP MCP servers', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithHome(makeTempDir());
    const cwd = makeTempDir();
    writeFileSync(
      path.join(cwd, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          remote: {
            url: 'https://mcp.example.com/mcp',
            headers: { Authorization: 'Bearer ${TOKEN}' },
          },
        },
      })
    );

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.servers.remote).toEqual({
      url: 'https://mcp.example.com/mcp',
      headers: { Authorization: 'Bearer ${TOKEN}' },
    });
  });

  it('loads direct tool settings', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithHome(makeTempDir());
    const cwd = makeTempDir();
    writeProjectConfig(
      cwd,
      JSON.stringify({
        directTools: { enabled: true, disableProxyTool: true },
        servers: {
          github: {
            command: 'npx',
            directTools: false,
          },
        },
      })
    );

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.directTools).toEqual({ enabled: true, disableProxyTool: true });
    expect(loaded.config.servers.github).toEqual({ command: 'npx', directTools: false });
  });

  it('reports invalid server fields and keeps valid values', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithHome(makeTempDir());
    const cwd = makeTempDir();
    writeProjectConfig(
      cwd,
      JSON.stringify({
        servers: {
          github: {
            command: 'npx',
            args: [1],
            lifecycle: 'forever',
            exposeResources: 'yes',
            directTools: 'yes',
            auth: true,
          },
        },
      })
    );

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.config.servers.github).toEqual({ command: 'npx' });
    expect(loaded.errors).toEqual([
      expect.stringContaining('invalid servers.github.args value'),
      expect.stringContaining('invalid servers.github.auth value'),
      expect.stringContaining('invalid servers.github.lifecycle value'),
      expect.stringContaining('invalid servers.github.exposeResources value'),
      expect.stringContaining('invalid servers.github.directTools value'),
    ]);
  });
});

async function loadTinyConfigFromNewProject() {
  const homeDir = makeTempDir();
  const projectDir = makeTempDir();
  const { loadConfig } = await importConfigWithHome(homeDir);
  return loadConfig(projectDir);
}

async function loadProjectConfig(projectConfig: object) {
  const cwd = makeTempDir();
  const { loadConfig } = await importConfigWithHome(makeTempDir());
  writeProjectConfig(cwd, JSON.stringify(projectConfig));
  return loadConfig(cwd);
}
