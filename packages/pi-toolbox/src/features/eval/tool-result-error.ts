import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import type { EvalToolDetails } from '#src/features/eval/types.js';

export function registerEvalToolResultError(pi: ExtensionAPI, toolName: string): void {
  pi.on('tool_result', (event) => {
    if (!isEvalToolResultEvent(event, toolName)) return;
    if (
      event.details.timedOut ||
      (event.details.exitCode !== 0 && event.details.exitCode !== null)
    ) {
      return { isError: true };
    }
  });
}

function isEvalToolResultEvent(
  event: unknown,
  toolName: string
): event is { toolName: string; details: EvalToolDetails } {
  return (
    typeof event === 'object' &&
    event !== null &&
    'toolName' in event &&
    (event as { toolName: unknown }).toolName === toolName &&
    'details' in event &&
    isEvalToolDetails((event as { details: unknown }).details)
  );
}

function isEvalToolDetails(details: unknown): details is EvalToolDetails {
  return (
    typeof details === 'object' &&
    details !== null &&
    'exitCode' in details &&
    'timedOut' in details &&
    'durationMs' in details
  );
}
