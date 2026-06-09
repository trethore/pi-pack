import type { NativeCompactionRuntime } from '#pi-codexify/features/openai-compaction/core/runtime.js';
import type { NativeCompactionRequestBody } from '#pi-codexify/features/openai-compaction/core/serializer.js';
import { isRecord } from '#pi-codexify/features/openai-compaction/core/structured.js';

const JSON_CONTENT_TYPE = 'application/json';

type CompactResponseEnvelope = {
  id?: string | undefined;
  created_at?: number | string | undefined;
  output: unknown[];
  [key: string]: unknown;
};

export type NativeCompactionClientFailureReason =
  | 'aborted'
  | 'network-error'
  | 'non-2xx'
  | 'empty-body'
  | 'invalid-json'
  | 'malformed-response'
  | 'empty-output';

export type NativeCompactionClientSuccess = {
  ok: true;
  status: number;
  compactedWindow: unknown[];
  compactResponseId?: string | undefined;
  createdAt?: string | undefined;
  response: CompactResponseEnvelope;
};

export type NativeCompactionClientFailure = {
  ok: false;
  reason: NativeCompactionClientFailureReason;
  status?: number | undefined;
  errorMessage?: string | undefined;
  responseText?: string | undefined;
  responseJson?: unknown | undefined;
};

export type NativeCompactionClientResult = NativeCompactionClientSuccess | NativeCompactionClientFailure;

export type ExecuteNativeCompactionOptions = {
  runtime: NativeCompactionRuntime;
  request: NativeCompactionRequestBody;
  signal?: AbortSignal | undefined;
};

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && (error.name === 'AbortError' || error.name === 'ABORT_ERR'))
  );
}

function normalizeResponseTimestamp(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(milliseconds).toISOString();
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? trimmed : new Date(parsed).toISOString();
}

function isCompactOutputItem(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}

function isCompactResponseEnvelope(value: unknown): value is CompactResponseEnvelope {
  return isRecord(value) && Array.isArray(value['output']!) && value['output']!.every(isCompactOutputItem);
}

function toHeaders(runtime: NativeCompactionRuntime): Record<string, string> {
  const headers = new Headers(runtime.currentModel.headers ?? {});
  for (const [key, value] of Object.entries(runtime.headers ?? {})) {
    headers.set(key, value);
  }
  headers.set('accept', JSON_CONTENT_TYPE);
  headers.set('content-type', JSON_CONTENT_TYPE);
  if (runtime.apiKey) {
    headers.set('authorization', `Bearer ${runtime.apiKey}`);
  }

  return Object.fromEntries(headers.entries());
}

export async function executeNativeCompaction(
  options: ExecuteNativeCompactionOptions
): Promise<NativeCompactionClientResult> {
  const { runtime, request, signal } = options;
  if (signal?.aborted) return { ok: false, reason: 'aborted' };

  try {
    const response = await postCompactionRequest(runtime, request, signal);
    return await parseCompactionResponse(response);
  } catch (error) {
    return createNetworkFailure(error);
  }
}

async function postCompactionRequest(
  runtime: NativeCompactionRuntime,
  request: NativeCompactionRequestBody,
  signal: AbortSignal | undefined
): Promise<Response> {
  return fetch(runtime.compactUrl, {
    method: 'POST',
    headers: toHeaders(runtime),
    body: JSON.stringify(request),
    ...(signal ? { signal } : {}),
  });
}

async function parseCompactionResponse(response: Response): Promise<NativeCompactionClientResult> {
  const responseText = await response.text();
  if (!response.ok) return createHttpFailure(response, responseText);
  if (!responseText.trim()) return { ok: false, reason: 'empty-body', status: response.status };

  const parsed = parseResponseJson(response, responseText);
  if (!parsed.ok) return parsed.failure;
  if (!isCompactResponseEnvelope(parsed.value)) {
    return { ok: false, reason: 'malformed-response', status: response.status, responseJson: parsed.value };
  }
  if (parsed.value.output.length === 0) {
    return { ok: false, reason: 'empty-output', status: response.status, responseJson: parsed.value };
  }
  return createCompactionSuccess(response.status, parsed.value);
}

function createHttpFailure(response: Response, responseText: string): NativeCompactionClientFailure {
  return {
    ok: false,
    reason: 'non-2xx',
    status: response.status,
    responseText: responseText || undefined,
    responseJson: responseText.trim() ? parseJsonOrUndefined(responseText) : undefined,
  };
}

function parseResponseJson(
  response: Response,
  responseText: string
): { ok: true; value: unknown } | { ok: false; failure: NativeCompactionClientFailure } {
  try {
    return { ok: true, value: JSON.parse(responseText) };
  } catch (error) {
    return {
      ok: false,
      failure: {
        ok: false,
        reason: 'invalid-json',
        status: response.status,
        errorMessage: error instanceof Error ? error.message : String(error),
        responseText,
      },
    };
  }
}

function parseJsonOrUndefined(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function createCompactionSuccess(status: number, parsed: CompactResponseEnvelope): NativeCompactionClientSuccess {
  return {
    ok: true,
    status,
    compactedWindow: [...parsed.output],
    compactResponseId: typeof parsed.id === 'string' && parsed.id.trim() ? parsed.id.trim() : undefined,
    createdAt: normalizeResponseTimestamp(parsed.created_at),
    response: parsed,
  };
}

function createNetworkFailure(error: unknown): NativeCompactionClientFailure {
  if (isAbortError(error)) return { ok: false, reason: 'aborted' };
  return { ok: false, reason: 'network-error', errorMessage: error instanceof Error ? error.message : String(error) };
}
