import { randomUUID } from 'node:crypto';
import { link, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CODEX_ACCOUNT_PREFIX, CODEX_PROVIDER } from '@trethore/shared/codex-provider.js';
import { isMissingPathError, isNodeError } from '@trethore/shared/error.js';
import { isPlainObject } from '@trethore/shared/object.js';

export interface Account {
  name: string;
  provider: string;
  baseProvider: string;
}

export function defaultAccount(baseProvider: string): Account {
  return { name: 'default', provider: baseProvider, baseProvider };
}

export function createAccount(input: string, baseProvider: string = CODEX_PROVIDER): Account {
  const name = input.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,47}$/.test(name) || name === 'default' || name === 'add') {
    throw new Error('Use 1-48 letters, digits, hyphens, or underscores. Names "default" and "add" are reserved.');
  }
  if (!baseProvider || /[\s\p{Cc}]/u.test(baseProvider)) {
    throw new Error('Invalid base provider ID.');
  }
  const prefix =
    baseProvider === CODEX_PROVIDER ? CODEX_ACCOUNT_PREFIX : `pi-account-${Buffer.from(baseProvider).toString('hex')}-`;
  return { name, baseProvider, provider: `${prefix}${name}` };
}

export class AccountStore {
  private readonly directory: string;

  constructor(agentDir: string) {
    this.directory = path.join(agentDir, 'pi-account', 'accounts');
  }

  async list(): Promise<Account[]> {
    let entries;
    try {
      entries = await readdir(this.directory, { withFileTypes: true });
    } catch (error) {
      if (isMissingPathError(error)) return [];
      throw error;
    }
    const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json'));
    const accounts = await Promise.all(files.map((entry) => this.readAccount(entry.name)));
    return accounts.sort((left, right) => left.name.localeCompare(right.name));
  }

  async add(input: string, baseProvider: string = CODEX_PROVIDER): Promise<Account> {
    const account = createAccount(input, baseProvider);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporaryPath = path.join(this.directory, `${randomUUID()}.tmp`);
    try {
      await writeFile(
        temporaryPath,
        `${JSON.stringify({ name: account.name, baseProvider: account.baseProvider })}\n`,
        { mode: 0o600, flag: 'wx' }
      );
      await this.publishAccount(temporaryPath, account);
    } finally {
      await rm(temporaryPath, { force: true });
    }
    return account;
  }

  private async publishAccount(temporaryPath: string, account: Account): Promise<void> {
    const fileName = `${account.name}.json`;
    try {
      await link(temporaryPath, path.join(this.directory, fileName));
    } catch (error) {
      if (!isNodeError(error) || error.code !== 'EEXIST') throw error;
      const existing = await this.readAccount(fileName);
      if (existing.baseProvider !== account.baseProvider) {
        throw new Error(
          `Account "${account.name}" already belongs to ${existing.baseProvider}. Use a different name.`,
          { cause: error }
        );
      }
    }
  }

  private async readAccount(fileName: string): Promise<Account> {
    const contents: unknown = JSON.parse(await readFile(path.join(this.directory, fileName), 'utf8'));
    if (!isPlainObject(contents) || typeof contents.name !== 'string') {
      throw new Error(`Invalid account file: ${fileName}`);
    }
    if (contents.baseProvider !== undefined && typeof contents.baseProvider !== 'string') {
      throw new Error(`Invalid base provider in account file: ${fileName}`);
    }
    const account = createAccount(contents.name, contents.baseProvider);
    if (fileName !== `${account.name}.json`) throw new Error(`Account name does not match file: ${fileName}`);
    return account;
  }
}
