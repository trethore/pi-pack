import { randomUUID } from 'node:crypto';

import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { getErrorMessage } from '@trethore/pi-shared/error.js';
import { isRecord } from '@trethore/pi-shared/object.js';
import {
  CODEX_PROVIDER,
  getCurrentCodexCredential,
  type CodexCredentialContext,
} from '#src/features/accounts/index.js';
import { buildChatGptBackendApiUrl } from '#src/utils/chatgpt-backend.js';

const RESET_CREDIT_COUNT_URL = buildChatGptBackendApiUrl('wham/rate-limit-reset-credits');
const RESET_CREDIT_CONSUME_URL = buildChatGptBackendApiUrl('wham/rate-limit-reset-credits/consume');

export const resetCreditActions = ['use', 'count', 'details'] as const;

type ResetCreditAction = (typeof resetCreditActions)[number];

type ResetCreditOptions = {
  fetch?: typeof fetch;
  randomUUID?: typeof randomUUID;
};

type ResetCreditCredentialContext = CodexCredentialContext & {
  modelRegistry: {
    authStorage: CodexCredentialContext['modelRegistry']['authStorage'] & {
      getApiKey(providerId: string, options?: { includeFallback?: boolean }): Promise<string | undefined>;
    };
  };
};

type ResetCreditResult = {
  status: number;
  statusText: string;
  body: unknown;
};

type ResetCreditCountResult = ResetCreditResult & {
  availableCount: number;
};

type ResetCreditDetailsResult = ResetCreditCountResult & {
  credits: ResetCreditDetail[];
};

type ResetCreditDetail = {
  id: string;
  used: boolean;
  expiresAt?: string;
};

export async function handleUseResetCreditCommand(
  ctx: ExtensionCommandContext,
  options: ResetCreditOptions = {}
): Promise<void> {
  const confirmed = await ctx.ui.confirm(
    'Use Codex reset credit?',
    'This will consume one rare Codex rate-limit reset credit for the active openai-codex account. Continue?'
  );

  if (!confirmed) {
    ctx.ui.notify('Codex reset credit request cancelled.', 'warning');
    return;
  }

  try {
    const result = await consumeResetCredit(ctx, options);
    ctx.ui.notify(buildResetCreditSuccessMessage(result), 'info');
  } catch (error) {
    ctx.ui.notify(`Codex reset credit request failed: ${getErrorMessage(error)}`, 'error');
  }
}

export async function handleResetCreditCountCommand(
  ctx: ExtensionCommandContext,
  options: ResetCreditOptions = {}
): Promise<void> {
  try {
    const result = await countResetCredits(ctx, options);
    ctx.ui.notify(`You have ${result.availableCount} reset tokens available.`, 'info');
  } catch (error) {
    ctx.ui.notify(`Codex reset credit count request failed: ${getErrorMessage(error)}`, 'error');
  }
}

export async function handleResetCreditDetailsCommand(
  ctx: ExtensionCommandContext,
  options: ResetCreditOptions = {}
): Promise<void> {
  try {
    const result = await getResetCreditDetails(ctx, options);
    ctx.ui.notify(buildResetCreditDetailsMessage(result), 'info');
  } catch (error) {
    ctx.ui.notify(`Codex reset credit details request failed: ${getErrorMessage(error)}`, 'error');
  }
}

export function parseResetCreditAction(value: string | undefined): ResetCreditAction | undefined {
  return resetCreditActions.find((action) => action === value);
}

export async function consumeResetCredit(
  ctx: ResetCreditCredentialContext,
  options: ResetCreditOptions = {}
): Promise<ResetCreditResult> {
  const accessToken = await getCurrentCodexAccessToken(ctx);
  const response = await (options.fetch ?? fetch)(RESET_CREDIT_CONSUME_URL, {
    method: 'POST',
    headers: buildResetCreditHeaders(accessToken, { contentType: true }),
    body: JSON.stringify({
      credit_id: null,
      redeem_request_id: (options.randomUUID ?? randomUUID)(),
    }),
  });
  const body = await readResponseBody(response);

  if (!response.ok) {
    throw new Error(`Reset credit request failed: ${response.status}${formatStatusText(response.statusText)}`);
  }

  return {
    status: response.status,
    statusText: response.statusText,
    body,
  };
}

export async function countResetCredits(
  ctx: ResetCreditCredentialContext,
  options: ResetCreditOptions = {}
): Promise<ResetCreditCountResult> {
  const result = await requestResetCredits(ctx, options, 'count');

  return {
    ...result,
    availableCount: getAvailableResetCreditCount(result.body),
  };
}

export async function getResetCreditDetails(
  ctx: ResetCreditCredentialContext,
  options: ResetCreditOptions = {}
): Promise<ResetCreditDetailsResult> {
  const result = await requestResetCredits(ctx, options, 'details');

  return {
    ...result,
    availableCount: getAvailableResetCreditCount(result.body),
    credits: getResetCreditDetailsFromBody(result.body),
  };
}

async function getCurrentCodexAccessToken(ctx: ResetCreditCredentialContext): Promise<string> {
  let credential = getCurrentCodexCredential(ctx);

  if (Date.now() >= credential.expires) {
    await ctx.modelRegistry.authStorage.getApiKey(CODEX_PROVIDER, { includeFallback: false });
    credential = getCurrentCodexCredential(ctx);
  }

  const accessToken = credential.access.trim();
  if (!accessToken) throw new Error(`Missing access token for ${CODEX_PROVIDER}. Use /login ${CODEX_PROVIDER} first.`);
  if (Date.now() >= credential.expires)
    throw new Error(`Expired access token for ${CODEX_PROVIDER}. Use /login ${CODEX_PROVIDER} again.`);
  return accessToken;
}

function buildResetCreditHeaders(accessToken: string, options: { contentType?: boolean } = {}): Record<string, string> {
  return {
    ...(options.contentType ? { 'Content-Type': 'application/json' } : {}),
    'OAI-Language': 'en',
    originator: 'Codex Desktop',
    Authorization: `Bearer ${accessToken}`,
  };
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function buildResetCreditSuccessMessage(result: ResetCreditResult): string {
  return [
    'Codex reset credit consumed successfully.',
    `Status: ${result.status}${formatStatusText(result.statusText)}`,
    `Result: ${formatResultBody(result.body)}`,
  ].join('\n');
}

export function buildResetCreditDetailsMessage(
  result: Pick<ResetCreditDetailsResult, 'availableCount' | 'credits'>
): string {
  if (result.credits.length === 0) {
    return ['No Codex reset credit details available.', `Available reset tokens: ${result.availableCount}`].join('\n');
  }

  return [
    'Codex reset credits',
    `Available reset tokens: ${result.availableCount}`,
    '',
    ...formatMarkdownTable([
      ['ID', 'Used', 'Expires'],
      ...result.credits.map((credit) => [
        shortenResetCreditId(credit.id),
        credit.used ? 'yes' : 'no',
        credit.expiresAt ?? 'unknown',
      ]),
    ]),
  ].join('\n');
}

function formatStatusText(statusText: string): string {
  return statusText ? ` ${statusText}` : '';
}

function formatResultBody(body: unknown): string {
  if (body === null) return 'empty';
  if (typeof body === 'string') return body;
  return JSON.stringify(body);
}

function getAvailableResetCreditCount(body: unknown): number {
  if (!isRecord(body)) {
    throw new TypeError('Reset credit response missing available count.');
  }

  const availableCount = body.available_count ?? body.availableCount;
  if (typeof availableCount !== 'number' || !Number.isFinite(availableCount)) {
    throw new TypeError('Reset credit response missing available count.');
  }

  return availableCount;
}

async function requestResetCredits(
  ctx: ResetCreditCredentialContext,
  options: ResetCreditOptions,
  action: 'count' | 'details'
): Promise<ResetCreditResult> {
  const accessToken = await getCurrentCodexAccessToken(ctx);
  const response = await (options.fetch ?? fetch)(RESET_CREDIT_COUNT_URL, {
    method: 'GET',
    headers: buildResetCreditHeaders(accessToken),
  });
  const body = await readResponseBody(response);

  if (!response.ok) {
    throw new Error(
      `Reset credit ${action} request failed: ${response.status}${formatStatusText(response.statusText)}`
    );
  }

  return {
    status: response.status,
    statusText: response.statusText,
    body,
  };
}

function getResetCreditDetailsFromBody(body: unknown): ResetCreditDetail[] {
  if (!isRecord(body) || !Array.isArray(body.credits)) return [];

  return body.credits.flatMap((credit) => {
    const normalizedCredit = normalizeResetCreditDetail(credit);
    return normalizedCredit ? [normalizedCredit] : [];
  });
}

function normalizeResetCreditDetail(credit: unknown): ResetCreditDetail | undefined {
  if (!isRecord(credit) || typeof credit.id !== 'string' || !credit.id.trim()) return undefined;

  const status = typeof credit.status === 'string' ? credit.status : undefined;
  return {
    id: credit.id.trim(),
    used: isUsedResetCreditStatus(status) || credit.redeemed_at != null,
    expiresAt: formatIsoDate(credit.expires_at),
  };
}

function isUsedResetCreditStatus(status: string | undefined): boolean {
  const normalizedStatus = status?.toLowerCase();
  return normalizedStatus === 'redeemed' || normalizedStatus === 'used' || normalizedStatus === 'consumed';
}

function formatIsoDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.trim() : date.toISOString();
}

function shortenResetCreditId(id: string): string {
  return id.length <= 24 ? id : `${id.slice(0, 16)}...${id.slice(-4)}`;
}

function formatMarkdownCell(value: string): string {
  return value.replaceAll('|', String.raw`\|`);
}

function formatMarkdownTable(rows: string[][]): string[] {
  const escapedRows = rows.map((row) => row.map(formatMarkdownCell));
  const columnWidths = escapedRows[0].map((_, columnIndex) =>
    Math.max(3, ...escapedRows.map((row) => row[columnIndex].length))
  );

  const [header, ...bodyRows] = escapedRows;
  return [formatMarkdownTableRow(header, columnWidths), formatMarkdownSeparatorRow(columnWidths), ...bodyRows.map((row) => formatMarkdownTableRow(row, columnWidths))];
}

function formatMarkdownTableRow(row: string[], columnWidths: number[]): string {
  return `| ${row.map((cell, index) => cell.padEnd(columnWidths[index])).join(' | ')} |`;
}

function formatMarkdownSeparatorRow(columnWidths: number[]): string {
  return `| ${columnWidths.map((width) => '-'.repeat(width)).join(' | ')} |`;
}
