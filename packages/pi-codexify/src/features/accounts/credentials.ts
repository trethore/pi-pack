import { promises as fs } from 'node:fs';
import path from 'node:path';

import { createModels, type Credential, type CredentialInfo, type CredentialStore } from '@earendil-works/pi-ai';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import { getAgentDir, type ModelRegistry } from '@earendil-works/pi-coding-agent';
import { isRecord } from '@trethore/pi-shared/object.js';

export const CODEX_PROVIDER = 'openai-codex';

export type CodexCredentialContext = {
  credentialStore?: CredentialStore;
  modelRegistry: Pick<ModelRegistry, 'getApiKeyForProvider'>;
};

class FileCredentialStore implements CredentialStore {
  private chain = Promise.resolve();

  constructor(private readonly authPath: string) {}

  async read(providerId: string): Promise<Credential | undefined> {
    const credentials = await this.readAll();
    return credentials[providerId];
  }

  async list(): Promise<readonly CredentialInfo[]> {
    return Object.entries(await this.readAll()).map(([providerId, credential]) => ({
      providerId,
      type: credential.type,
    }));
  }

  modify(
    providerId: string,
    update: (current: Credential | undefined) => Promise<Credential | undefined>
  ): Promise<Credential | undefined> {
    return this.enqueue(async () => {
      const credentials = await this.readAll();
      const next = await update(credentials[providerId]);
      if (next === undefined) return credentials[providerId];
      credentials[providerId] = next;
      await this.writeAll(credentials);
      return next;
    });
  }

  delete(providerId: string): Promise<void> {
    return this.enqueue(async () => {
      const credentials = await this.readAll();
      delete credentials[providerId];
      await this.writeAll(credentials);
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.chain.then(operation, operation);
    this.chain = result.then(
      () => {},
      () => {}
    );
    return result;
  }

  private async readAll(): Promise<Record<string, Credential>> {
    try {
      const value: unknown = JSON.parse(await fs.readFile(this.authPath, 'utf8'));
      if (!isRecord(value)) return {};
      return Object.fromEntries(
        Object.entries(value).filter((entry): entry is [string, Credential] => isCredential(entry[1]))
      );
    } catch (error) {
      if (isRecord(error) && error.code === 'ENOENT') return {};
      throw error;
    }
  }

  private async writeAll(credentials: Record<string, Credential>): Promise<void> {
    await fs.mkdir(path.dirname(this.authPath), { recursive: true });
    const temporaryPath = `${this.authPath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(temporaryPath, this.authPath);
    await fs.chmod(this.authPath, 0o600);
  }
}

const defaultCredentialStore = new FileCredentialStore(path.join(getAgentDir(), 'auth.json'));
const codexModels = createModels({ credentials: defaultCredentialStore });
codexModels.setProvider(openaiCodexProvider());

function getCredentialStore(ctx: CodexCredentialContext): CredentialStore {
  return ctx.credentialStore ?? defaultCredentialStore;
}

export async function readCodexCredential(
  ctx: CodexCredentialContext,
  refresh = true
): Promise<Credential | undefined> {
  if (refresh) {
    await (ctx.credentialStore
      ? ctx.modelRegistry.getApiKeyForProvider(CODEX_PROVIDER)
      : codexModels.getAuth(CODEX_PROVIDER));
  }
  return getCredentialStore(ctx).read(CODEX_PROVIDER);
}

export async function writeCodexCredential(ctx: CodexCredentialContext, credential: Credential): Promise<void> {
  await getCredentialStore(ctx).modify(CODEX_PROVIDER, async () => credential);
}

export async function applyCodexCredentialHeaders(headers: Record<string, string | null>): Promise<void> {
  const auth = await codexModels.getAuth(CODEX_PROVIDER);
  const credential = await defaultCredentialStore.read(CODEX_PROVIDER);
  if (credential?.type !== 'oauth' || !auth?.auth.apiKey) return;

  headers.Authorization = `Bearer ${auth.auth.apiKey}`;
  const accountId = getCredentialAccountId(credential);
  if (accountId) headers['chatgpt-account-id'] = accountId;
}

export function getCredentialAccountId(credential: Credential | undefined): string | undefined {
  if (credential?.type !== 'oauth') return undefined;
  const accountId = credential.accountId ?? credential.account_id;
  return typeof accountId === 'string' && accountId.trim() ? accountId.trim() : undefined;
}

function isCredential(value: unknown): value is Credential {
  if (!isRecord(value)) return false;
  if (value.type === 'api_key') return value.key === undefined || typeof value.key === 'string';
  return (
    value.type === 'oauth' &&
    typeof value.access === 'string' &&
    typeof value.refresh === 'string' &&
    typeof value.expires === 'number'
  );
}
