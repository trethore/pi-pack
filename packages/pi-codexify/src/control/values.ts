import {
  reasoningSummaryValues,
  serviceTierValues,
  verbosityValues,
  type CodexReasoningSummary,
  type CodexServiceTier,
  type CodexVerbosity,
} from '#src/config/types.js';

export function parseVerbosity(value: string): CodexVerbosity | 'off' | undefined {
  if (value === 'off') return value;
  return verbosityValues.find((candidate) => candidate === value);
}

export function parseReasoningSummary(value: string): CodexReasoningSummary | 'off' | undefined {
  if (value === 'off') return value;
  return reasoningSummaryValues.find((candidate) => candidate === value);
}

export function parseServiceTier(value: string): CodexServiceTier | undefined {
  return serviceTierValues.find((candidate) => candidate === value);
}
