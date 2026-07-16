import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { getErrorMessage } from '@trethore/pi-shared/error.js';
import {
  CODEX_PROVIDER,
  getCodexCredentialAccountId,
  getCurrentCodexCredential,
  type CodexCredentialContext,
} from '#src/utils/codex-credential.js';
import { buildChatGptBackendApiUrl } from '#src/utils/chatgpt-backend.js';

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

const USAGE_URL = buildChatGptBackendApiUrl('wham/usage');

export async function notifyCodexUsage(ctx: ExtensionCommandContext): Promise<void> {
  try {
    const data = await fetchUsage(ctx);
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
  return getFiniteNumber(window?.reset_after_seconds) ?? getSecondsUntilResetAt(window?.reset_at);
}

function getFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && !Number.isNaN(value) ? Math.max(0, value) : null;
}

function getSecondsUntilResetAt(value: unknown): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  const resetAtSeconds = normalizeTimestampSeconds(value);
  return Math.max(0, Math.round(resetAtSeconds - Date.now() / 1000));
}

function normalizeTimestampSeconds(value: number): number {
  return value > 100_000_000_000 ? value / 1000 : value;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return 'unknown';

  const totalSeconds = Math.max(0, Math.round(seconds));
  const duration = splitDuration(totalSeconds);
  return formatDurationParts(duration) ?? `${totalSeconds}s`;
}

function formatDurationParts(duration: { days: number; hours: number; minutes: number }): string | undefined {
  return [
    { value: duration.days, text: `${duration.days}d ${duration.hours}h` },
    { value: duration.hours, text: `${duration.hours}h ${duration.minutes}m` },
    { value: duration.minutes, text: `${duration.minutes}m` },
  ].find((part) => part.value > 0)?.text;
}

function splitDuration(totalSeconds: number): { days: number; hours: number; minutes: number } {
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
  };
}

function formatPercentUsed(value: number | null): string {
  if (value == null) return 'unknown';
  return `${Math.round(clampPercent(value))}% used`;
}

function formatPercentLeft(value: number | null): string {
  if (value == null) return 'unknown';
  return `${Math.round(clampPercent(value))}% left`;
}

async function loadAuthCredentials(ctx: CodexCredentialContext): Promise<{ accessToken: string; accountId: string }> {
  const credential = await getCurrentCodexCredential(ctx);
  const accessToken = requireAuthField(credential.access.trim(), 'access token');
  const accountId = requireAuthField(getCodexCredentialAccountId(credential), 'accountId');

  return { accessToken, accountId };
}

function requireAuthField(value: string | undefined, label: string): string {
  if (value) return value;
  throw new Error(`Missing ${label} for ${CODEX_PROVIDER}. Use /login ${CODEX_PROVIDER} first.`);
}

async function fetchUsage(ctx: CodexCredentialContext): Promise<CodexUsageResponse> {
  const { accessToken, accountId } = await loadAuthCredentials(ctx);
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
