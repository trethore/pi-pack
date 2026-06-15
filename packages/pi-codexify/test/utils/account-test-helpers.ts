import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { AuthStorage } from '@earendil-works/pi-coding-agent';

export const CODEX_PROVIDER = 'openai-codex';

export function createContext() {
  return {
    modelRegistry: {
      authStorage: AuthStorage.inMemory(),
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
  ctx.modelRegistry.authStorage.set(CODEX_PROVIDER, createCredential(label));
}

export function makeProfilePath(prefix: string): string {
  return path.join(mkdtempSync(path.join(tmpdir(), prefix)), 'accounts.json');
}
