import { promises as fs } from 'node:fs';
import path from 'node:path';

import { getAgentDir } from '@mariozechner/pi-coding-agent';
import type { ExtensionCommandContext } from '@mariozechner/pi-coding-agent';

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

type CodexUsageResponse = {
  rate_limit?: RateLimitBucket | null;
};

type OpenAICodexAuthEntry = {
  type?: string;
  access?: string | null;
  accountId?: string | null;
  account_id?: string | null;
};

const AUTH_FILE = path.join(getAgentDir(), 'auth.json');
const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';

export async function notifyCodexUsage(ctx: ExtensionCommandContext): Promise<void> {
  try {
    const data = await fetchUsage();
    ctx.ui.notify(buildUsageMessage(data), 'info');
  } catch (error) {
    ctx.ui.notify(`codexify usage failed: ${getErrorMessage(error)}`, 'warning');
  }
}

function buildUsageMessage(data: CodexUsageResponse): string {
  const bucket = data.rate_limit;
  const fiveHourSummary = summarizeWindow(bucket?.primary_window);
  const sevenDaySummary = summarizeWindow(bucket?.secondary_window);

  return [
    formatUsageTitle(bucket),
    formatWindowUsageLine('5h', fiveHourSummary),
    formatWindowResetLine('5h', fiveHourSummary),
    formatWindowUsageLine('7d', sevenDaySummary),
    formatWindowResetLine('7d', sevenDaySummary),
  ].join('\n');
}

function formatUsageTitle(bucket: RateLimitBucket | null | undefined): string {
  return `Codex usage${isLimited(bucket) ? ' (LIMITED)' : ''}`;
}

function isLimited(bucket: RateLimitBucket | null | undefined): boolean {
  return bucket?.limit_reached === true || bucket?.allowed === false;
}

type UsageSummary = {
  used: number | null;
  left: number | null;
  resetSeconds: number | null;
};

function summarizeWindow(window: UsageWindow | null | undefined): UsageSummary {
  const used = window?.used_percent ?? null;

  return {
    used,
    left: usedToLeftPercent(used),
    resetSeconds: getResetSeconds(window),
  };
}

function formatWindowUsageLine(label: string, summary: UsageSummary): string {
  return `${label}: ${formatPercentUsed(summary.used)} / ${formatPercentLeft(summary.left)}`;
}

function formatWindowResetLine(label: string, summary: UsageSummary): string {
  return `${label} reset: ${formatDuration(summary.resetSeconds)}`;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function usedToLeftPercent(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return clampPercent(100 - value);
}

function getResetSeconds(window: UsageWindow | null | undefined): number | null {
  const resetAfterSeconds = window?.reset_after_seconds;
  if (typeof resetAfterSeconds === 'number' && !Number.isNaN(resetAfterSeconds)) {
    return Math.max(0, resetAfterSeconds);
  }

  const resetAt = window?.reset_at;
  if (typeof resetAt !== 'number' || Number.isNaN(resetAt)) return null;

  const resetAtSeconds = resetAt > 100_000_000_000 ? resetAt / 1000 : resetAt;
  return Math.max(0, Math.round(resetAtSeconds - Date.now() / 1000));
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return 'unknown';

  const totalSeconds = Math.max(0, Math.round(seconds));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;

  return `${totalSeconds}s`;
}

function formatPercentUsed(value: number | null): string {
  if (value == null) return 'unknown';
  return `${Math.round(clampPercent(value))}% used`;
}

function formatPercentLeft(value: number | null): string {
  if (value == null) return 'unknown';
  return `${Math.round(clampPercent(value))}% left`;
}

async function loadAuthCredentials(): Promise<{ accessToken: string; accountId: string }> {
  const raw = await fs.readFile(AUTH_FILE, 'utf8');
  const auth = JSON.parse(raw) as Record<string, OpenAICodexAuthEntry | undefined>;
  const entry = auth['openai-codex'];

  if (entry?.type !== 'oauth') {
    throw new Error(`Missing openai-codex OAuth entry in ${AUTH_FILE}`);
  }

  const accessToken = entry.access?.trim();
  const accountId = getAccountId(entry);

  if (!accessToken || !accountId) {
    throw new Error(`Missing access token or accountId in ${AUTH_FILE}`);
  }

  return { accessToken, accountId };
}

function getAccountId(entry: OpenAICodexAuthEntry): string | undefined {
  const accountId = entry.accountId ?? entry.account_id;
  return typeof accountId === 'string' ? accountId.trim() : undefined;
}

async function fetchUsage(): Promise<CodexUsageResponse> {
  const { accessToken, accountId } = await loadAuthCredentials();
  const response = await fetch(USAGE_URL, {
    headers: {
      accept: '*/*',
      authorization: `Bearer ${accessToken}`,
      'chatgpt-account-id': accountId,
    },
  });

  if (!response.ok) {
    throw new Error(`Usage request failed: ${response.status}`);
  }

  return (await response.json()) as CodexUsageResponse;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
