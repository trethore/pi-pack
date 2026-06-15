import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { auth, type OAuthClientProvider, type OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { getGlobalConfigPath } from '@trethore/pi-shared/config/locations.js';
import { isRecord } from '@trethore/pi-shared/object.js';

import type { ServerConfig } from '#src/config/schema.js';
import { interpolateEnvVars } from '#src/utils/env.js';

const OAUTH_FILE_NAME = 'pi-tiny-mcp-oauth.json';
const DEFAULT_REDIRECT_URL = 'http://127.0.0.1:33418/oauth/callback';

export interface OAuthAuthorizationResult {
  status: 'authorized' | 'redirect';
  authorizationUrl?: string;
}

interface OAuthStore {
  version: number;
  servers: Record<string, OAuthServerState>;
}

interface OAuthServerState {
  tokens?: OAuthTokens;
  clientInformation?: OAuthClientInformationMixed;
  codeVerifier?: string;
  discoveryState?: OAuthDiscoveryState;
  authorizationUrl?: string;
  state?: string;
}

export async function authorizeOAuthServer(
  serverName: string,
  definition: ServerConfig,
  authorizationCode?: string,
  state?: string
): Promise<OAuthAuthorizationResult> {
  if (definition.auth !== 'oauth') throw new Error(`MCP server "${serverName}" does not use OAuth.`);
  if (!definition.url) throw new Error(`MCP OAuth server "${serverName}" has no url.`);

  const provider = createOAuthProvider(serverName);
  if (state) provider.validateState(state);

  const result = await auth(provider, {
    serverUrl: new URL(interpolateEnvVars(definition.url)),
    authorizationCode,
  });

  if (result === 'AUTHORIZED') return { status: 'authorized' };
  return { status: 'redirect', authorizationUrl: provider.authorizationUrl() };
}

export function createOAuthProvider(serverName: string): PiTinyMcpOAuthProvider {
  return new PiTinyMcpOAuthProvider(serverName, new OAuthStateStore());
}

class PiTinyMcpOAuthProvider implements OAuthClientProvider {
  readonly redirectUrl = DEFAULT_REDIRECT_URL;

  constructor(
    private readonly serverName: string,
    private readonly store: OAuthStateStore
  ) {}

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.redirectUrl],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_name: 'Pi tiny MCP',
    };
  }

  state(): string {
    const state = randomUUID();
    this.store.updateServer(this.serverName, (entry) => {
      entry.state = state;
    });
    return state;
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    return this.store.getServer(this.serverName).clientInformation;
  }

  saveClientInformation(clientInformation: OAuthClientInformationMixed): void {
    this.store.updateServer(this.serverName, (entry) => {
      entry.clientInformation = clientInformation;
    });
  }

  tokens(): OAuthTokens | undefined {
    return this.store.getServer(this.serverName).tokens;
  }

  saveTokens(tokens: OAuthTokens): void {
    this.store.updateServer(this.serverName, (entry) => {
      entry.tokens = tokens;
      entry.authorizationUrl = undefined;
      entry.codeVerifier = undefined;
      entry.state = undefined;
    });
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    this.store.updateServer(this.serverName, (entry) => {
      entry.authorizationUrl = authorizationUrl.toString();
    });
  }

  authorizationUrl(): string | undefined {
    return this.store.getServer(this.serverName).authorizationUrl;
  }

  validateState(state: string): void {
    const expectedState = this.store.getServer(this.serverName).state;
    if (expectedState && state !== expectedState) {
      throw new Error(`OAuth state mismatch for MCP server "${this.serverName}".`);
    }
  }

  saveCodeVerifier(codeVerifier: string): void {
    this.store.updateServer(this.serverName, (entry) => {
      entry.codeVerifier = codeVerifier;
    });
  }

  codeVerifier(): string {
    const verifier = this.store.getServer(this.serverName).codeVerifier;
    if (!verifier) throw new Error(`No pending OAuth authorization for MCP server "${this.serverName}".`);
    return verifier;
  }

  saveDiscoveryState(discoveryState: OAuthDiscoveryState): void {
    this.store.updateServer(this.serverName, (entry) => {
      entry.discoveryState = discoveryState;
    });
  }

  discoveryState(): OAuthDiscoveryState | undefined {
    return this.store.getServer(this.serverName).discoveryState;
  }

  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): void {
    this.store.updateServer(this.serverName, (entry) => {
      if (scope === 'all' || scope === 'client') entry.clientInformation = undefined;
      if (scope === 'all' || scope === 'tokens') entry.tokens = undefined;
      if (scope === 'all' || scope === 'verifier') entry.codeVerifier = undefined;
      if (scope === 'all' || scope === 'discovery') entry.discoveryState = undefined;
    });
  }
}

class OAuthStateStore {
  getServer(serverName: string): OAuthServerState {
    return loadOAuthStore().servers[serverName] ?? {};
  }

  updateServer(serverName: string, update: (entry: OAuthServerState) => void): void {
    const store = loadOAuthStore();
    const entry = store.servers[serverName] ? { ...store.servers[serverName] } : {};
    update(entry);
    store.servers[serverName] = entry;
    saveOAuthStore(store);
  }
}

function getOAuthStorePath(): string {
  return getGlobalConfigPath(OAUTH_FILE_NAME);
}

function loadOAuthStore(): OAuthStore {
  const storePath = getOAuthStorePath();
  if (!existsSync(storePath)) return createEmptyStore();

  try {
    const parsed = JSON.parse(readFileSync(storePath, 'utf8')) as unknown;
    if (!isOAuthStore(parsed)) return createEmptyStore();
    return parsed;
  } catch {
    return createEmptyStore();
  }
}

function saveOAuthStore(store: OAuthStore): void {
  const storePath = getOAuthStorePath();
  mkdirSync(path.dirname(storePath), { recursive: true });
  const tmpPath = `${storePath}.${process.pid}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(store, null, 2), { encoding: 'utf8', mode: 0o600 });
  renameSync(tmpPath, storePath);
}

function createEmptyStore(): OAuthStore {
  return { version: 1, servers: {} };
}

function isOAuthStore(value: unknown): value is OAuthStore {
  return isRecord(value) && value.version === 1 && isRecord(value.servers);
}
