import { randomUUID } from 'node:crypto';

import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { getErrorMessage } from '@trethore/pi-shared/error.js';
import { isRecord } from '@trethore/pi-shared/object.js';
import {
  CODEX_PROVIDER,
  getCurrentCodexCredential,
  type CodexCredentialContext,
} from '#src/features/accounts/index.js';

const RESET_CREDIT_COUNT_URL = 'https://chatgpt.com/wham/rate-limit-reset-credits';
const RESET_CREDIT_CONSUME_URL = 'https://chatgpt.com/wham/rate-limit-reset-credits/consume';

export const resetCreditActions = ['use', 'count'] as const;

type ResetCreditAction = (typeof resetCreditActions)[number];

type ResetCreditOptions = {
  fetch?: typeof fetch;
  randomUUID?: typeof randomUUID;
};

type ResetCreditResult = {
  status: number;
  statusText: string;
  body: unknown;
};

type ResetCreditCountResult = ResetCreditResult & {
  availableCount: number;
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

export function parseResetCreditAction(value: string | undefined): ResetCreditAction | undefined {
  return resetCreditActions.find((action) => action === value);
}

export async function consumeResetCredit(
  ctx: CodexCredentialContext,
  options: ResetCreditOptions = {}
): Promise<ResetCreditResult> {
  const accessToken = getCurrentCodexAccessToken(ctx);
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
  ctx: CodexCredentialContext,
  options: ResetCreditOptions = {}
): Promise<ResetCreditCountResult> {
  const accessToken = getCurrentCodexAccessToken(ctx);
  const response = await (options.fetch ?? fetch)(RESET_CREDIT_COUNT_URL, {
    method: 'GET',
    headers: buildResetCreditHeaders(accessToken),
  });
  const body = await readResponseBody(response);

  if (!response.ok) {
    throw new Error(`Reset credit count request failed: ${response.status}${formatStatusText(response.statusText)}`);
  }

  return {
    status: response.status,
    statusText: response.statusText,
    body,
    availableCount: getAvailableResetCreditCount(body),
  };
}

function getCurrentCodexAccessToken(ctx: CodexCredentialContext): string {
  const credential = getCurrentCodexCredential(ctx);
  const accessToken = credential.access.trim();
  if (!accessToken) throw new Error(`Missing access token for ${CODEX_PROVIDER}. Use /login ${CODEX_PROVIDER} first.`);
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

function formatStatusText(statusText: string): string {
  return statusText ? ` ${statusText}` : '';
}

function formatResultBody(body: unknown): string {
  if (body === null) return 'empty';
  if (typeof body === 'string') return body;
  return JSON.stringify(body);
}

function getAvailableResetCreditCount(body: unknown): number {
  if (!isRecord(body) || typeof body.availableCount !== 'number' || !Number.isFinite(body.availableCount)) {
    throw new Error('Reset credit count response missing availableCount.');
  }

  return body.availableCount;
}
