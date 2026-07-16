import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Credential, CredentialInfo, CredentialStore } from '@earendil-works/pi-ai';

export const CODEX_PROVIDER = 'openai-codex';

export function createContext() {
  const credentialStore = new TestCredentialStore();
  return {
    credentialStore,
    modelRegistry: {
      getApiKeyForProvider: async (providerId: string) => {
        const credential = await credentialStore.read(providerId);
        return credential?.type === 'oauth' ? credential.access : credential?.key;
      },
    },
  };
}

export function createCredential(label: string) {
  return {
    type: 'oauth' as const,
    access: `access-${label}`,
    refresh: `refresh-${label}`,
    expires: 1_800_000_000_000,
    accountId: `account-${label}`,
  };
}

export function setCodexCredential(ctx: ReturnType<typeof createContext>, label: string): void {
  ctx.credentialStore.set(CODEX_PROVIDER, createCredential(label));
}

export function makeProfilePath(prefix: string): string {
  return path.join(mkdtempSync(path.join(tmpdir(), prefix)), 'accounts.json');
}

class TestCredentialStore implements CredentialStore {
  private readonly credentials = new Map<string, Credential>();

  set(providerId: string, credential: Credential): void {
    this.credentials.set(providerId, credential);
  }

  async read(providerId: string): Promise<Credential | undefined> {
    return this.credentials.get(providerId);
  }

  async list(): Promise<readonly CredentialInfo[]> {
    return [...this.credentials].map(([providerId, credential]) => ({ providerId, type: credential.type }));
  }

  async modify(
    providerId: string,
    update: (current: Credential | undefined) => Promise<Credential | undefined>
  ): Promise<Credential | undefined> {
    const current = this.credentials.get(providerId);
    const next = await update(current);
    if (next !== undefined) this.credentials.set(providerId, next);
    return next ?? current;
  }

  async delete(providerId: string): Promise<void> {
    this.credentials.delete(providerId);
  }
}
