function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseJsonObject(value: string): unknown | undefined {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function extractJsonObjectFromMessage(message: string): unknown | undefined {
  const start = message.indexOf('{');
  if (start === -1) return undefined;
  for (let end = message.length; end > start; end -= 1) {
    const parsed = parseJsonObject(message.slice(start, end).trim());
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function header(headers: Record<string, string | number | undefined> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name.toLowerCase())
      return asString(value) ?? (typeof value === 'number' ? String(value) : undefined);
  }
  return undefined;
}

function formatReset(seconds: number | undefined, resetsAt: number | undefined): string | undefined {
  const remaining = seconds ?? (resetsAt ? Math.max(0, Math.round(resetsAt - Date.now() / 1000)) : undefined);
  if (remaining === undefined) return undefined;
  const minutes = Math.max(0, Math.round(remaining / 60));
  if (minutes < 90) return `Resets in ~${minutes}m.`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `Resets in ~${hours}h.`;
}

function normalizeErrorEnvelope(value: unknown) {
  if (!isRecord(value)) return;
  const error = isRecord(value.error) ? value.error : undefined;
  const headers = isRecord(value.headers) ? value.headers : undefined;
  return {
    statusCode: asNumber(value.status_code),
    code: asString(error?.code) ?? asString(error?.type),
    planType: asString(error?.plan_type),
    resetsAt: asNumber(error?.resets_at),
    resetsInSeconds: asNumber(error?.resets_in_seconds),
    headers: headers as Record<string, string | number | undefined> | undefined,
  };
}

export function formatCodexUsageLimitError(value: unknown): string | undefined {
  const envelope = normalizeErrorEnvelope(
    typeof value === 'string' ? (parseJsonObject(value) ?? extractJsonObjectFromMessage(value)) : value
  );
  if (!envelope) return undefined;
  if (
    !/usage_limit_reached|usage_not_included|rate_limit_exceeded/i.test(envelope.code ?? '') &&
    envelope.statusCode !== 429
  )
    return undefined;

  const plan = envelope.planType ? ` (${envelope.planType.toLowerCase()} plan)` : '';
  const reset = formatReset(
    envelope.resetsInSeconds ?? asNumber(header(envelope.headers, 'X-Codex-Primary-Reset-After-Seconds')),
    envelope.resetsAt ?? asNumber(header(envelope.headers, 'X-Codex-Primary-Reset-At'))
  );
  return [`Codex usage limit reached${plan}.`, reset].filter(Boolean).join(' ');
}
