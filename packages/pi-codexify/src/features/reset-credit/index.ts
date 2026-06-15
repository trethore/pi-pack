import { randomUUID } from 'node:crypto';

import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { getErrorMessage } from '@trethore/pi-shared/error.js';
import {
  CODEX_PROVIDER,
  getCurrentCodexCredential,
  type CodexCredentialContext,
} from '#src/features/accounts/index.js';

const RESET_CREDIT_URL = 'https://chatgpt.com/wham/rate-limit-reset-credits/consume';

type ResetCreditOptions = {
  fetch?: typeof fetch;
  randomUUID?: typeof randomUUID;
};

type ResetCreditResult = {
  status: number;
  statusText: string;
  body: unknown;
};

export async function handleResetCreditCommand(
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

export async function consumeResetCredit(
  ctx: CodexCredentialContext,
  options: ResetCreditOptions = {}
): Promise<ResetCreditResult> {
  const accessToken = getCurrentCodexAccessToken(ctx);
  const response = await (options.fetch ?? fetch)(RESET_CREDIT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'OAI-Language': 'en',
      originator: 'Codex Desktop',
      Authorization: `Bearer ${accessToken}`,
    },
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

function getCurrentCodexAccessToken(ctx: CodexCredentialContext): string {
  const credential = getCurrentCodexCredential(ctx);
  const accessToken = credential.access.trim();
  if (!accessToken) throw new Error(`Missing access token for ${CODEX_PROVIDER}. Use /login ${CODEX_PROVIDER} first.`);
  return accessToken;
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
