import { randomUUID } from 'node:crypto';

import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { getErrorMessage } from '@trethore/pi-shared/error.js';
import { isRecord } from '@trethore/pi-shared/object.js';
import { backendUrl, formatResponseStatus, readResponseBody } from '#src/codex/backend.js';
import { CODEX_PROVIDER, getCodexCredential, type CodexCredentialContext } from '#src/codex/credentials.js';

const DETAILS_URL = backendUrl('wham/rate-limit-reset-credits');
const CONSUME_URL = backendUrl('wham/rate-limit-reset-credits/consume');

export const resetActions = ['use', 'details'] as const;
export type ResetAction = (typeof resetActions)[number];

export function parseResetAction(value: string | undefined): ResetAction | undefined {
  return resetActions.find((action) => action === value);
}

type ResetOptions = {
  fetch?: typeof fetch;
  randomUUID?: typeof randomUUID;
};

type ResetResult = {
  status: number;
  statusText: string;
  body: unknown;
};

type ResetCredit = {
  id: string;
  used: boolean;
  expiresAt?: string;
};

type ResetDetails = ResetResult & {
  availableCount: number;
  credits: ResetCredit[];
};

export async function handleUseReset(ctx: ExtensionCommandContext, options: ResetOptions = {}): Promise<void> {
  const confirmed = await ctx.ui.confirm(
    'Use Codex reset credit?',
    'This will consume one rare Codex rate-limit reset credit for the active openai-codex account. Continue?'
  );

  if (!confirmed) {
    ctx.ui.notify('Codex reset credit request cancelled.', 'warning');
    return;
  }

  try {
    const result = await consumeReset(ctx, options);
    ctx.ui.notify(
      [
        'Codex reset credit consumed successfully.',
        `Status: ${formatResponseStatus(result)}`,
        `Result: ${formatBody(result.body)}`,
      ].join('\n'),
      'info'
    );
  } catch (error) {
    ctx.ui.notify(`Codex reset credit request failed: ${getErrorMessage(error)}`, 'error');
  }
}

export async function handleResetDetails(ctx: ExtensionCommandContext, options: ResetOptions = {}): Promise<void> {
  try {
    ctx.ui.notify(formatResetDetails(await getResetDetails(ctx, options)), 'info');
  } catch (error) {
    ctx.ui.notify(`Codex reset credit details request failed: ${getErrorMessage(error)}`, 'error');
  }
}

export async function consumeReset(ctx: CodexCredentialContext, options: ResetOptions = {}): Promise<ResetResult> {
  const response = await (options.fetch ?? fetch)(CONSUME_URL, {
    method: 'POST',
    headers: resetHeaders(await accessToken(ctx), true),
    body: JSON.stringify({
      credit_id: null,
      redeem_request_id: (options.randomUUID ?? randomUUID)(),
    }),
  });
  const body = await readResponseBody(response);
  if (!response.ok) throw new Error(`Reset credit request failed: ${formatResponseStatus(response)}`);
  return { status: response.status, statusText: response.statusText, body };
}

export async function getResetDetails(ctx: CodexCredentialContext, options: ResetOptions = {}): Promise<ResetDetails> {
  const response = await (options.fetch ?? fetch)(DETAILS_URL, {
    method: 'GET',
    headers: resetHeaders(await accessToken(ctx)),
  });
  const body = await readResponseBody(response);
  if (!response.ok) throw new Error(`Reset credit details request failed: ${formatResponseStatus(response)}`);

  return {
    status: response.status,
    statusText: response.statusText,
    body,
    availableCount: availableCount(body),
    credits: credits(body),
  };
}

export function formatResetDetails(result: Pick<ResetDetails, 'availableCount' | 'credits'>): string {
  if (result.credits.length === 0) {
    return `No Codex reset credit details available.\nAvailable reset tokens: ${result.availableCount}`;
  }

  return [
    'Codex reset credits',
    `Available reset tokens: ${result.availableCount}`,
    '',
    ...markdownTable([
      ['ID', 'Used', 'Expires'],
      ...result.credits.map((credit) => [
        shortenId(credit.id),
        credit.used ? 'yes' : 'no',
        credit.expiresAt ?? 'unknown',
      ]),
    ]),
  ].join('\n');
}

async function accessToken(ctx: CodexCredentialContext): Promise<string> {
  const credential = await getCodexCredential(ctx);
  const token = credential.access.trim();
  if (!token) throw new Error(`Missing access token for ${CODEX_PROVIDER}. Use /login ${CODEX_PROVIDER} first.`);
  if (Date.now() >= credential.expires) {
    throw new Error(`Expired access token for ${CODEX_PROVIDER}. Use /login ${CODEX_PROVIDER} again.`);
  }
  return token;
}

function resetHeaders(token: string, contentType = false): Record<string, string> {
  return {
    ...(contentType ? { 'Content-Type': 'application/json' } : {}),
    'OAI-Language': 'en',
    originator: 'Codex Desktop',
    Authorization: `Bearer ${token}`,
  };
}

function availableCount(body: unknown): number {
  if (!isRecord(body)) throw new TypeError('Reset credit response missing available count.');
  const count = body.available_count ?? body.availableCount;
  if (typeof count !== 'number' || !Number.isFinite(count)) {
    throw new TypeError('Reset credit response missing available count.');
  }
  return count;
}

function credits(body: unknown): ResetCredit[] {
  if (!isRecord(body) || !Array.isArray(body.credits)) return [];
  return body.credits.flatMap((value) => {
    if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim()) return [];
    const status = typeof value.status === 'string' ? value.status.toLowerCase() : undefined;
    return [
      {
        id: value.id.trim(),
        used: status === 'redeemed' || status === 'used' || status === 'consumed' || value.redeemed_at != null,
        expiresAt: isoDate(value.expires_at),
      },
    ];
  });
}

function isoDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.trim() : date.toISOString();
}

function formatBody(body: unknown): string {
  if (body === null) return 'empty';
  return typeof body === 'string' ? body : JSON.stringify(body);
}

function shortenId(id: string): string {
  return id.length <= 24 ? id : `${id.slice(0, 16)}...${id.slice(-4)}`;
}

function markdownTable(rows: string[][]): string[] {
  const escaped = rows.map((row) => row.map((cell) => cell.replaceAll('|', String.raw`\|`)));
  const widths = escaped[0].map((_, index) => Math.max(3, ...escaped.map((row) => row[index].length)));
  const formatRow = (row: string[]) => `| ${row.map((cell, index) => cell.padEnd(widths[index])).join(' | ')} |`;
  return [
    formatRow(escaped[0]),
    `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`,
    ...escaped.slice(1).map((row) => formatRow(row)),
  ];
}
