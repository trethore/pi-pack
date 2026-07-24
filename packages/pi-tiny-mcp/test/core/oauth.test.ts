import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const oauthTest = vi.hoisted(() => ({
  auth: vi.fn(),
  storePath: '',
}));

vi.mock('@modelcontextprotocol/sdk/client/auth.js', () => ({
  auth: oauthTest.auth,
}));

vi.mock('@trethore/pi-shared/config/locations.js', () => ({
  getGlobalConfigPath: () => oauthTest.storePath,
}));

import { authorizeOAuthServer, createOAuthProvider } from '#pi-tiny-mcp/core/oauth.js';

describe('authorizeOAuthServer', () => {
  beforeEach(() => {
    oauthTest.storePath = path.join(mkdtempSync(path.join(tmpdir(), 'pi-tiny-mcp-oauth-test-')), 'oauth.json');
    oauthTest.auth.mockReset();
  });

  it('rejects non-OAuth and URL-less definitions', async () => {
    await expect(authorizeOAuthServer('server', { command: 'server' })).rejects.toThrow(
      'MCP server "server" does not use OAuth.'
    );
    await expect(authorizeOAuthServer('server', { auth: 'oauth' })).rejects.toThrow(
      'MCP OAuth server "server" has no url.'
    );
  });

  it('returns an authorized result and forwards the authorization code', async () => {
    vi.stubEnv('MCP_HOST', 'example.test');
    oauthTest.auth.mockResolvedValue('AUTHORIZED');

    const result = await authorizeOAuthServer(
      'server',
      { auth: 'oauth', url: 'https://${MCP_HOST}/mcp' },
      'authorization-code'
    );

    expect(result).toEqual({ status: 'authorized' });
    expect(oauthTest.auth).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        serverUrl: new URL('https://example.test/mcp'),
        authorizationCode: 'authorization-code',
      })
    );
  });

  it('returns the saved authorization redirect and validates matching state', async () => {
    const pendingProvider = createOAuthProvider('server');
    const state = pendingProvider.state();
    oauthTest.auth.mockImplementation(async (provider) => {
      provider.redirectToAuthorization(new URL('https://auth.example/authorize'));
      return 'REDIRECT';
    });

    const result = await authorizeOAuthServer(
      'server',
      { auth: 'oauth', url: 'https://example.test' },
      undefined,
      state
    );

    expect(result).toEqual({ status: 'redirect', authorizationUrl: 'https://auth.example/authorize' });
  });

  it('rejects mismatched state before authorizing', async () => {
    createOAuthProvider('server').state();

    await expect(
      authorizeOAuthServer('server', { auth: 'oauth', url: 'https://example.test' }, undefined, 'wrong-state')
    ).rejects.toThrow('OAuth state mismatch for MCP server "server".');
    expect(oauthTest.auth).not.toHaveBeenCalled();
  });
});

describe('OAuth provider persistence', () => {
  beforeEach(() => {
    oauthTest.storePath = path.join(mkdtempSync(path.join(tmpdir(), 'pi-tiny-mcp-oauth-test-')), 'oauth.json');
    oauthTest.auth.mockReset();
  });

  it('exposes OAuth client metadata', () => {
    const provider = createOAuthProvider('server');

    expect(provider.redirectUrl).toBe('http://127.0.0.1:33418/oauth/callback');
    expect(provider.clientMetadata).toEqual({
      redirect_uris: ['http://127.0.0.1:33418/oauth/callback'],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_name: 'Pi tiny MCP',
    });
  });

  it('persists client information, tokens, verifier, discovery, redirect, and state', () => {
    const provider = createOAuthProvider('server');
    const clientInformation = { client_id: 'client-id' };
    const tokens = { access_token: 'access-token', token_type: 'bearer' };
    const discoveryState = { authorizationServerUrl: 'https://auth.example' };

    const state = provider.state();
    provider.saveClientInformation(clientInformation);
    provider.saveCodeVerifier('verifier');
    provider.saveDiscoveryState(discoveryState as never);
    provider.redirectToAuthorization(new URL('https://auth.example/authorize'));

    const reloaded = createOAuthProvider('server');
    expect(reloaded.clientInformation()).toEqual(clientInformation);
    expect(reloaded.codeVerifier()).toBe('verifier');
    expect(reloaded.discoveryState()).toEqual(discoveryState);
    expect(reloaded.authorizationUrl()).toBe('https://auth.example/authorize');
    expect(() => reloaded.validateState(state)).not.toThrow();

    reloaded.saveTokens(tokens);

    expect(reloaded.tokens()).toEqual(tokens);
    expect(reloaded.authorizationUrl()).toBeUndefined();
    expect(() => reloaded.codeVerifier()).toThrow('No pending OAuth authorization for MCP server "server".');
    expect(() => reloaded.validateState('anything')).not.toThrow();
  });

  it.each([
    { scope: 'client' as const, removed: 'client' },
    { scope: 'tokens' as const, removed: 'tokens' },
    { scope: 'verifier' as const, removed: 'verifier' },
    { scope: 'discovery' as const, removed: 'discovery' },
    { scope: 'all' as const, removed: 'all' },
  ])('invalidates $scope credentials', ({ scope, removed }) => {
    const provider = createOAuthProvider('server');
    provider.saveClientInformation({ client_id: 'client-id' });
    provider.saveTokens({ access_token: 'token', token_type: 'bearer' });
    provider.saveCodeVerifier('verifier');
    provider.saveDiscoveryState({ authorizationServerUrl: 'https://auth.example' } as never);

    provider.invalidateCredentials(scope);

    expect(provider.clientInformation() === undefined).toBe(removed === 'client' || removed === 'all');
    expect(provider.tokens() === undefined).toBe(removed === 'tokens' || removed === 'all');
    if (removed === 'verifier' || removed === 'all') {
      expect(() => provider.codeVerifier()).toThrow();
    } else {
      expect(provider.codeVerifier()).toBe('verifier');
    }
    expect(provider.discoveryState() === undefined).toBe(removed === 'discovery' || removed === 'all');
  });

  it.each(['{invalid json', 'null', '{}', '{"version":2,"servers":{}}', '{"version":1,"servers":[]}'])(
    'recovers from invalid OAuth stores: %s',
    (contents) => {
      writeFileSync(oauthTest.storePath, contents);
      const provider = createOAuthProvider('server');

      expect(provider.tokens()).toBeUndefined();
      provider.saveTokens({ access_token: 'token', token_type: 'bearer' });

      expect(JSON.parse(readFileSync(oauthTest.storePath, 'utf8'))).toMatchObject({
        version: 1,
        servers: { server: { tokens: { access_token: 'token' } } },
      });
    }
  );

  it('keeps independent server records and writes private files atomically', () => {
    const first = createOAuthProvider('first');
    const second = createOAuthProvider('second');
    first.saveTokens({ access_token: 'first-token', token_type: 'bearer' });
    second.saveTokens({ access_token: 'second-token', token_type: 'bearer' });

    expect(first.tokens()?.access_token).toBe('first-token');
    expect(second.tokens()?.access_token).toBe('second-token');
    expect(readFileSync(oauthTest.storePath, 'utf8')).toContain('second-token');
    expect(() => rmSync(`${oauthTest.storePath}.${process.pid}.tmp`)).toThrow();
  });
});
