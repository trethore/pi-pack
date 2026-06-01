import type { TruncationResult } from '@earendil-works/pi-coding-agent';

import type { RuntimeConfig } from '#src/config/schema.js';
import type { EvalLanguage, RunEvalOptions, RunEvalResult } from '#src/features/eval/runner.js';

export interface EvalParameters {
  language: EvalLanguage;
  code: string;
  timeoutMs?: number;
  cwd?: string;
}

export interface PreparedEvalParameters {
  language: EvalLanguage;
  code: string;
  timeoutMs: number;
  cwd: string;
  runtime: RuntimeConfig;
}

export interface EvalDefinition {
  name: string;
  label: string;
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
  parameters: EvalParametersJsonSchema;
}

export interface EvalParametersJsonSchema {
  type: 'object';
  additionalProperties: boolean;
  required: string[];
  properties: {
    language: { enum: string[]; description: string } & Record<string, unknown>;
    code: Record<string, unknown>;
    timeoutMs: { description: string; maximum?: number } & Record<string, unknown>;
    cwd: Record<string, unknown>;
  };
}

export interface EvalToolDetails {
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  truncation?: TruncationResult;
  fullOutputPath?: string;
}

export interface EvalToolOptions {
  cwd?: string;
  runner?: EvalRunner;
}

export type EvalRunner = (options: RunEvalOptions) => Promise<RunEvalResult>;
