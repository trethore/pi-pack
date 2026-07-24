import { readFileSync, writeFileSync } from 'node:fs';

import { getGlobalConfigPath } from '@trethore/pi-shared/config/locations.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearMetadataCache,
  createServerCacheEntry,
  isServerCacheValid,
  loadMetadataCache,
  reconstructToolMetadata,
  saveServerMetadataCache,
} from '#pi-tiny-mcp/core/metadata-cache.js';

const cachePath = getGlobalConfigPath('pi-tiny-mcp-cache.json');

describe('metadata cache persistence', () => {
  beforeEach(() => {
    clearMetadataCache();
  });

  it('clears and merges server cache entries', () => {
    const first = createServerCacheEntry({ command: 'first' }, [{ name: 'search' }], []);
    const second = createServerCacheEntry({ command: 'second' }, [], [{ name: 'README', uri: 'file:///README.md' }]);

    saveServerMetadataCache('first', first);
    saveServerMetadataCache('second', second);

    expect(loadMetadataCache()).toEqual({ version: 1, servers: { first, second } });
    expect(readFileSync(cachePath, 'utf8')).toContain('README');
  });

  it.each(['{invalid', 'null', '{}', '{"version":2,"servers":{}}', '{"version":1,"servers":[]}'])(
    'rejects malformed cache content: %s',
    (content) => {
      writeFileSync(cachePath, content);

      expect(loadMetadataCache()).toBeNull();
    }
  );
});

describe('metadata cache entries', () => {
  it('filters incomplete metadata and reconstructs tools and resources', () => {
    const definition = { command: 'server' };
    const entry = createServerCacheEntry(
      definition,
      [{ name: '' }, { name: 'search', description: 'Search', inputSchema: { type: 'object' } }],
      [
        { name: '', uri: 'file:///invalid' },
        { name: 'Missing URI', uri: '' },
        { name: 'README', uri: 'file:///README.md', description: 'Read me' },
      ]
    );

    expect(entry.tools).toEqual([{ name: 'search', description: 'Search', inputSchema: { type: 'object' } }]);
    expect(entry.resources).toEqual([{ name: 'README', uri: 'file:///README.md', description: 'Read me' }]);
    expect(reconstructToolMetadata('server', entry, definition, 'server').map((tool) => tool.name)).toEqual([
      'server_search',
      'server_get_readme',
    ]);
  });

  it('validates hashes, timestamps, unlimited age, fresh entries, and stale entries', () => {
    vi.spyOn(Date, 'now').mockReturnValue(10 * 60 * 60 * 1000);
    const definition = { command: 'server', args: ['--flag'] };
    const entry = createServerCacheEntry(definition, [], []);

    expect(isServerCacheValid(undefined, definition, 1)).toBe(false);
    expect(isServerCacheValid(entry, { command: 'different' }, 1)).toBe(false);
    expect(isServerCacheValid({ ...entry, cachedAt: Number.NaN }, definition, 1)).toBe(false);
    expect(isServerCacheValid({ ...entry, cachedAt: 0 }, definition, 0)).toBe(true);
    expect(isServerCacheValid({ ...entry, cachedAt: 9.5 * 60 * 60 * 1000 }, definition, 1)).toBe(true);
    expect(isServerCacheValid({ ...entry, cachedAt: 8 * 60 * 60 * 1000 }, definition, 1)).toBe(false);
  });

  it('hashes resolved environment configuration deterministically', () => {
    vi.stubEnv('MCP_VALUE', 'resolved');
    const interpolated = createServerCacheEntry(
      {
        command: 'server',
        args: ['one'],
        env: { TOKEN: '${MCP_VALUE}' },
        cwd: '~/project',
        url: 'https://${MCP_VALUE}.test',
        headers: { Header: '$env:MCP_VALUE' },
        auth: 'bearer',
        bearerToken: '${MCP_VALUE}',
        bearerTokenEnv: 'TOKEN_ENV',
        exposeResources: false,
        excludeTools: ['hidden'],
      },
      [],
      []
    );
    const resolved = createServerCacheEntry(
      {
        command: 'server',
        args: ['one'],
        env: { TOKEN: 'resolved' },
        cwd: `${process.env.HOME}/project`,
        url: 'https://resolved.test',
        headers: { Header: 'resolved' },
        auth: 'bearer',
        bearerToken: 'resolved',
        bearerTokenEnv: 'TOKEN_ENV',
        exposeResources: false,
        excludeTools: ['hidden'],
      },
      [],
      []
    );

    expect(interpolated.configHash).toBe(resolved.configHash);
  });
});
