import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { getErrorMessage } from '@trethore/pi-shared/error.js';
import { backendUrl } from '#src/codex/backend.js';
import {
  CODEX_PROVIDER,
  getAccountId,
  getCodexCredential,
  type CodexCredentialContext,
} from '#src/codex/credentials.js';

type UsageWindow = {
  used_percent?: number | null;
  reset_after_seconds?: number | null;
  reset_at?: number | null;
};

type RateLimitBucket = {
  primary_window?: UsageWindow | null;
  secondary_window?: UsageWindow | null;
  allowed?: boolean;
  limit_reached?: boolean;
};

type UsageResponse = {
  rate_limit?: RateLimitBucket | null;
};

type UsageSummary = {
  used: number | null;
  left: number | null;
  resetSeconds: number | null;
};

const USAGE_URL = backendUrl('wham/usage');

export async function notifyUsage(ctx: ExtensionCommandContext): Promise<void> {
  try {
    ctx.ui.notify(formatUsage(await fetchUsage(ctx)), 'info');
  } catch (error) {
    ctx.ui.notify(`codexify usage failed: ${getErrorMessage(error)}`, 'warning');
  }
}

async function fetchUsage(ctx: CodexCredentialContext): Promise<UsageResponse> {
  const credential = await getCodexCredential(ctx);
  const accessToken = requireField(credential.access.trim(), 'access token');
  const accountId = requireField(getAccountId(credential), 'accountId');
  const response = await fetch(USAGE_URL, {
    headers: {
      accept: '*/*',
      authorization: `Bearer ${accessToken}`,
      'chatgpt-account-id': accountId,
    },
  });

  if (!response.ok) throw new Error(`Usage request failed: ${response.status}`);
  return (await response.json()) as UsageResponse;
}

function requireField(value: string | undefined, label: string): string {
  if (value) return value;
  throw new Error(`Missing ${label} for ${CODEX_PROVIDER}. Use /login ${CODEX_PROVIDER} first.`);
}

function formatUsage(data: UsageResponse): string {
  const bucket = data.rate_limit;
  const primary = summarize(bucket?.primary_window);
  const secondary = summarize(bucket?.secondary_window);

  return [
    `Codex usage${bucket?.limit_reached === true || bucket?.allowed === false ? ' (LIMITED)' : ''}`,
    formatWindow('5h', primary),
    `5h reset: ${formatDuration(primary.resetSeconds)}`,
    formatWindow('7d', secondary),
    `7d reset: ${formatDuration(secondary.resetSeconds)}`,
  ].join('\n');
}

function summarize(window: UsageWindow | null | undefined): UsageSummary {
  const used = finiteNumber(window?.used_percent, false);
  return {
    used,
    left: used === null ? null : clampPercent(100 - used),
    resetSeconds: finiteNumber(window?.reset_after_seconds) ?? secondsUntil(window?.reset_at),
  };
}

function formatWindow(label: string, summary: UsageSummary): string {
  return `${label}: ${formatPercent(summary.used, 'used')} / ${formatPercent(summary.left, 'left')}`;
}

function formatPercent(value: number | null, label: string): string {
  return value === null ? 'unknown' : `${Math.round(clampPercent(value))}% ${label}`;
}

function finiteNumber(value: unknown, clampToZero = true): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return clampToZero ? Math.max(0, value) : value;
}

function secondsUntil(value: unknown): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  const timestampSeconds = value > 100_000_000_000 ? value / 1000 : value;
  return Math.max(0, Math.round(timestampSeconds - Date.now() / 1000));
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return 'unknown';
  const total = Math.max(0, Math.round(seconds));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${total}s`;
}
