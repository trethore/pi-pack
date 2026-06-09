import type { SessionBeforeCompactEvent } from '@earendil-works/pi-coding-agent';
import type {
  NativeCompactionClientFailure,
  NativeCompactionClientSuccess,
} from '#pi-codexify/features/openai-compaction/core/client.js';
import { formatCodexUsageLimitError } from '#pi-codexify/features/openai-compaction/core/errors.js';
import {
  extractCompactionSummaryText,
  hasCompactionOutputItem,
  sanitizeCompactedWindow,
  summarizeCompactionOutputForDiagnostics,
} from '#pi-codexify/features/openai-compaction/core/output.js';
import type { NativeCompactionRuntime } from '#pi-codexify/features/openai-compaction/core/runtime.js';
import type { NativeCompactionRequestBody } from '#pi-codexify/features/openai-compaction/core/serializer.js';
import {
  createNativeCompactionDetails,
  createNativeCompactionShimResult,
  NATIVE_COMPACTION_SHIM_SUMMARY,
} from '#pi-codexify/features/openai-compaction/core/types.js';

export type NativeCompactionInstallResult =
  | {
      ok: true;
      compaction: ReturnType<typeof createNativeCompactionShimResult>;
    }
  | {
      ok: false;
      fallbackMessage: string;
    };

export function formatCompactFailureMessage(compactResult: NativeCompactionClientFailure): string {
  const status = compactResult.status ? ` HTTP ${compactResult.status}` : '';
  const friendly = formatCodexUsageLimitError(
    compactResult.responseJson ?? compactResult.responseText ?? compactResult.errorMessage
  );
  if (friendly) return `OpenAI native compaction failed (${compactResult.reason}${status}): ${friendly}`;

  const detail = formatCompactFailureDetail(compactResult.responseText?.trim(), compactResult.errorMessage);
  return `OpenAI native compaction failed (${compactResult.reason}${status})${detail}`;
}

function formatCompactFailureDetail(response: string | undefined, errorMessage: string | undefined): string {
  if (response) return `: ${response.slice(0, 500)}`;
  return errorMessage ? `: ${errorMessage}` : '';
}

export function createNativeCompactionInstallResult(args: {
  compactResult: NativeCompactionClientSuccess;
  request: NativeCompactionRequestBody;
  runtime: NativeCompactionRuntime;
  event: SessionBeforeCompactEvent;
  compactionModel: string;
  compactedKeptWindow: boolean;
}): NativeCompactionInstallResult {
  const compactedWindow = sanitizeCompactedWindow(args.compactResult.compactedWindow);
  const invalidMessage = validateCompactedWindowForInstall(args.compactResult, args.request, compactedWindow);
  if (invalidMessage) return { ok: false, fallbackMessage: invalidMessage };

  try {
    return {
      ok: true,
      compaction: createNativeCompactionShimResult({
        summary: NATIVE_COMPACTION_SHIM_SUMMARY,
        firstKeptEntryId: args.event.preparation.firstKeptEntryId,
        tokensBefore: args.event.preparation.tokensBefore,
        details: createNativeCompactionDetails({
          provider: args.runtime.provider,
          api: args.runtime.api,
          model: args.compactionModel,
          baseUrl: args.runtime.baseUrl,
          compactedWindow,
          compactResponseId: args.compactResult.compactResponseId,
          createdAt: args.compactResult.createdAt,
          requestMeta: {
            tokensBefore: args.event.preparation.tokensBefore,
            previousSummaryPresent: Boolean(args.event.preparation.previousSummary),
            compactedKeptWindow: args.compactedKeptWindow,
          },
        }),
      }),
    };
  } catch {
    return { ok: false, fallbackMessage: 'OpenAI native compaction produced details Pi could not store' };
  }
}

function validateCompactedWindowForInstall(
  compactResult: NativeCompactionClientSuccess,
  request: NativeCompactionRequestBody,
  compactedWindow: Record<string, unknown>[]
): string | undefined {
  if (compactedWindow.length === 0) return buildEmptyCompactedWindowMessage(compactResult, request, compactedWindow);
  if (!hasCompactionOutputItem(compactedWindow))
    return buildMissingCompactionItemMessage(compactResult, request, compactedWindow);
  if (!extractCompactionSummaryText(compactedWindow))
    return buildMissingSummaryMessage(compactResult, request, compactedWindow);
  return undefined;
}

function buildEmptyCompactedWindowMessage(
  compactResult: NativeCompactionClientSuccess,
  request: NativeCompactionRequestBody,
  compactedWindow: readonly unknown[]
): string {
  return `OpenAI native compaction returned no installable compacted context. Request: ${formatCompactRequestDiagnostics(request)}. Output: ${summarizeCompactionOutputForDiagnostics(compactResult.compactedWindow, compactedWindow)}`;
}

function buildMissingCompactionItemMessage(
  compactResult: NativeCompactionClientSuccess,
  request: NativeCompactionRequestBody,
  compactedWindow: readonly unknown[]
): string {
  return `OpenAI native compaction did not return a compaction item. Response=${formatCompactResponseId(compactResult)}. Request: ${formatCompactRequestDiagnostics(request)}. Output: ${summarizeCompactionOutputForDiagnostics(compactResult.compactedWindow, compactedWindow)}`;
}

function buildMissingSummaryMessage(
  compactResult: NativeCompactionClientSuccess,
  request: NativeCompactionRequestBody,
  compactedWindow: readonly unknown[]
): string {
  return `OpenAI native compaction returned compacted context without a displayable summary. Response=${formatCompactResponseId(compactResult)}. Request: ${formatCompactRequestDiagnostics(request)}. Output: ${summarizeCompactionOutputForDiagnostics(compactResult.compactedWindow, compactedWindow)}`;
}

function formatCompactResponseId(compactResult: NativeCompactionClientSuccess): string {
  return compactResult.compactResponseId ?? '<none>';
}

function formatCompactRequestDiagnostics(request: NativeCompactionRequestBody): string {
  const serviceTier = typeof request.service_tier === 'string' ? request.service_tier : 'none';
  const tools = Array.isArray(request.tools) ? request.tools.length : 0;
  return `model=${request.model}, input=${request.input.length}, tools=${tools}, reasoning=${formatReasoningEffort(request.reasoning)}, service_tier=${serviceTier}`;
}

function formatReasoningEffort(reasoning: unknown): string {
  if (!reasoning || typeof reasoning !== 'object' || Array.isArray(reasoning)) return 'none';
  const effort = (reasoning as Record<string, unknown>)['effort'];
  return typeof effort === 'string' ? effort : 'none';
}
