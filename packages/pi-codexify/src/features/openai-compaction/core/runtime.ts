import type { Api, Model } from '@earendil-works/pi-ai';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';

const SUPPORTED_PROVIDER = 'openai';
const SUPPORTED_API = 'openai-responses';
const OPENAI_COMPACT_PATH = 'responses/compact';

type RuntimeModel = Model<Api>;

type NativeCompactionFailureReason =
  | 'disabled'
  | 'missing-model'
  | 'unsupported-provider'
  | 'unsupported-api'
  | 'missing-base-url'
  | 'missing-api-key'
  | 'unsupported-payload'
  | 'payload-model-mismatch';

export type NativeCompactionSupportOptions = {
  enabled?: boolean | undefined;
};

export type ResponsesCompatibleRequestPayload = {
  model: string;
  input: unknown[];
  instructions?: unknown | undefined;
  [key: string]: unknown;
};

export type NativeCompactionRuntime = {
  provider: typeof SUPPORTED_PROVIDER;
  api: typeof SUPPORTED_API;
  model: string;
  baseUrl: string;
  apiKey?: string | undefined;
  headers?: Record<string, string> | undefined;
  compactUrl: string;
  payload?: ResponsesCompatibleRequestPayload | undefined;
  currentModel: RuntimeModel;
};

export type NativeCompactionEnvironmentFailure = {
  ok: false;
  reason: NativeCompactionFailureReason;
  provider?: string | undefined;
  api?: string | undefined;
  model?: string | undefined;
  baseUrl?: string | undefined;
};

export type NativeCompactionEnvironmentSuccess = {
  ok: true;
  runtime: NativeCompactionRuntime;
};

export type NativeCompactionEnvironmentResolution =
  | NativeCompactionEnvironmentFailure
  | NativeCompactionEnvironmentSuccess;

export function normalizeBaseUrl(baseUrl: string | undefined | null): string | undefined {
  const normalized = baseUrl?.trim().replace(/\/+$/, '');
  return normalized || undefined;
}

export function buildCompactUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl) ?? baseUrl;
  return normalized.endsWith('/responses') ? `${normalized}/compact` : `${normalized}/${OPENAI_COMPACT_PATH}`;
}

async function resolveRequestAuth(
  ctx: ExtensionContext,
  model: RuntimeModel
): Promise<{ apiKey?: string | undefined; headers?: Record<string, string> | undefined }> {
  const modelRegistry = ctx.modelRegistry as {
    getApiKeyAndHeaders?: (
      currentModel: RuntimeModel
    ) =>
      | Promise<
          | { ok: true; apiKey?: string | undefined; headers?: Record<string, string> | undefined }
          | { ok: false; error: string }
        >
      | undefined;
  };

  if (typeof modelRegistry.getApiKeyAndHeaders !== 'function') return {};

  const auth = await modelRegistry.getApiKeyAndHeaders(model);
  return auth && auth.ok ? { apiKey: auth.apiKey, headers: auth.headers } : {};
}

export function isResponsesCompatiblePayload(payload: unknown): payload is ResponsesCompatibleRequestPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;

  const candidate = payload as Record<string, unknown>;
  return typeof candidate['model'] === 'string' && Array.isArray(candidate['input']);
}

export function getRuntimeModelDescriptor(model: RuntimeModel | undefined): {
  provider?: string | undefined;
  api?: string | undefined;
  model?: string | undefined;
  baseUrl?: string | undefined;
} {
  if (!model) return {};

  return {
    provider: model.provider,
    api: model.api,
    model: model.id,
    baseUrl: normalizeBaseUrl(model.baseUrl),
  };
}

export async function resolveNativeCompactionEnvironment(
  ctx: ExtensionContext,
  options: NativeCompactionSupportOptions = {},
  payload?: unknown
): Promise<NativeCompactionEnvironmentResolution> {
  if (options.enabled === false) return { ok: false, reason: 'disabled' };

  const currentModel = ctx.model;
  const descriptor = getRuntimeModelDescriptor(currentModel);
  const modelFailure = validateRuntimeModel(currentModel, descriptor);
  if (modelFailure) return modelFailure;

  const payloadResolution = resolveRequestPayload(payload, descriptor.model!);
  if (!payloadResolution.ok) return { ...payloadResolution.failure, ...descriptor };

  const { apiKey, headers } = await resolveRequestAuth(ctx, currentModel!);
  if (!hasRequestAuth(apiKey, headers)) return { ok: false, reason: 'missing-api-key', ...descriptor };

  return {
    ok: true,
    runtime: {
      provider: SUPPORTED_PROVIDER,
      api: SUPPORTED_API,
      model: descriptor.model!,
      baseUrl: descriptor.baseUrl!,
      apiKey,
      headers,
      compactUrl: buildCompactUrl(descriptor.baseUrl!),
      payload: payloadResolution.payload,
      currentModel: currentModel!,
    },
  };
}

function validateRuntimeModel(
  model: RuntimeModel | undefined,
  descriptor: ReturnType<typeof getRuntimeModelDescriptor>
): NativeCompactionEnvironmentFailure | undefined {
  if (!model || !descriptor.provider || !descriptor.api || !descriptor.model) {
    return { ok: false, reason: 'missing-model', ...descriptor };
  }
  if (descriptor.provider !== SUPPORTED_PROVIDER) return { ok: false, reason: 'unsupported-provider', ...descriptor };
  if (descriptor.api !== SUPPORTED_API) return { ok: false, reason: 'unsupported-api', ...descriptor };
  if (!descriptor.baseUrl) return { ok: false, reason: 'missing-base-url', ...descriptor };
  return undefined;
}

function resolveRequestPayload(
  payload: unknown,
  model: string
):
  | { ok: true; payload: ResponsesCompatibleRequestPayload | undefined }
  | { ok: false; failure: NativeCompactionEnvironmentFailure } {
  if (payload === undefined) return { ok: true, payload: undefined };
  if (!isResponsesCompatiblePayload(payload))
    return { ok: false, failure: { ok: false, reason: 'unsupported-payload' } };
  if (payload.model !== model) return { ok: false, failure: { ok: false, reason: 'payload-model-mismatch' } };
  return { ok: true, payload };
}

function hasRequestAuth(apiKey: string | undefined, headers: Record<string, string> | undefined): boolean {
  return Boolean(apiKey) || Object.entries(headers ?? {}).some((entry) => isAuthorizationHeader(entry));
}

function isAuthorizationHeader([key, value]: [string, string]): boolean {
  return key.toLowerCase() === 'authorization' && value.trim().length > 0;
}
