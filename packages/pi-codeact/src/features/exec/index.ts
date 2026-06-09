import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  type ExtensionAPI,
  truncateTail,
  type ToolDefinition,
  type TruncationResult,
} from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

const EXEC_TOOL_DEFINITION = readExecDefinition();

const DEFAULT_TIMEOUT_SECONDS = 30;
const PACKAGE_INSTALL_TIMEOUT_SECONDS = 120;

interface ExecDefinition {
  name: string;
  label: string;
  description: string[];
  promptSnippet: string;
  promptGuidelines: string[];
  parameters: ExecParametersJsonSchema;
}

interface ExecParametersJsonSchema {
  type: 'object';
  additionalProperties: boolean;
  required: string[];
  properties: {
    packages: Record<string, unknown>;
    code: Record<string, unknown>;
    timeout: { description: string } & Record<string, unknown>;
  };
}

type ExecParametersSchema = ReturnType<typeof createExecParametersSchema>;

interface ExecParameters {
  packages?: string[];
  code: string;
  timeout?: number;
}

interface PreparedExecParameters {
  packages: string[];
  code: string;
  timeout: number;
}

interface ExecToolDetails {
  packages: string[];
  exitCode: number;
  killed: boolean;
  stdout: TruncationResult;
  stderr: TruncationResult;
}

export function registerExecTool(pi: ExtensionAPI): void {
  pi.registerTool(createExecToolDefinition(pi));
}

export function createExecToolDefinition(
  pi: ExtensionAPI
): ToolDefinition<ExecParametersSchema, ExecToolDetails | undefined> {
  return {
    name: EXEC_TOOL_DEFINITION.name,
    label: EXEC_TOOL_DEFINITION.label,
    description: createExecDescription(),
    promptSnippet: EXEC_TOOL_DEFINITION.promptSnippet,
    promptGuidelines: EXEC_TOOL_DEFINITION.promptGuidelines,
    parameters: createExecParametersSchema(),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const preparedParams = prepareExecParameters(params);
      const workspace = await createWorkspace(preparedParams.code);

      try {
        if (preparedParams.packages.length > 0) {
          await installPackages(pi, workspace.directory, preparedParams.packages, signal);
        }

        const result = await pi.exec(process.execPath, [workspace.modulePath], {
          cwd: ctx.cwd,
          signal,
          timeout: preparedParams.timeout * 1000,
        });
        const stdout = truncateTail(result.stdout, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
        const stderr = truncateTail(result.stderr, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });

        return {
          content: [{ type: 'text', text: formatExecOutput(stdout, stderr) }],
          details: {
            packages: preparedParams.packages,
            exitCode: result.code,
            killed: result.killed,
            stdout,
            stderr,
          },
        };
      } finally {
        await rm(workspace.directory, { recursive: true, force: true });
      }
    },
  };
}

function readExecDefinition(): ExecDefinition {
  return JSON.parse(readFileSync(new URL('exec-definition.json', import.meta.url), 'utf8')) as ExecDefinition;
}

function createExecDescription(): string {
  return EXEC_TOOL_DEFINITION.description
    .join('\n\n')
    .replace('{{defaultMaxLines}}', String(DEFAULT_MAX_LINES))
    .replace('{{defaultMaxBytes}}', formatSize(DEFAULT_MAX_BYTES));
}

function createExecParametersSchema() {
  const parameters = structuredClone(EXEC_TOOL_DEFINITION.parameters);
  parameters.properties.timeout.description = parameters.properties.timeout.description.replace(
    '{{defaultTimeout}}',
    String(DEFAULT_TIMEOUT_SECONDS)
  );
  return Type.Unsafe<ExecParameters>(parameters);
}

function prepareExecParameters(params: ExecParameters): PreparedExecParameters {
  return {
    packages: normalizePackages(params.packages),
    code: params.code,
    timeout: params.timeout ?? DEFAULT_TIMEOUT_SECONDS,
  };
}

function normalizePackages(packages: string[] | undefined): string[] {
  return [...new Set((packages ?? []).map((packageName) => packageName.trim()))].filter(Boolean);
}

async function createWorkspace(code: string): Promise<{ directory: string; modulePath: string }> {
  const directory = await mkdtemp(path.join(tmpdir(), 'pi-codeact-'));
  const modulePath = path.join(directory, 'user.ts');

  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ type: 'module' }, null, 2), 'utf8');
  await writeFile(modulePath, code, 'utf8');

  return { directory, modulePath };
}

async function installPackages(
  pi: ExtensionAPI,
  directory: string,
  packages: readonly string[],
  signal: AbortSignal | undefined
): Promise<void> {
  const result = await pi.exec(
    'npm',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', ...packages],
    { cwd: directory, signal, timeout: PACKAGE_INSTALL_TIMEOUT_SECONDS * 1000 }
  );

  if (result.code !== 0) {
    throw new Error(formatInstallError(result.stdout, result.stderr));
  }
}

function formatInstallError(stdout: string, stderr: string): string {
  return ['exec failed to install packages', stdout.trim(), stderr.trim()].filter(Boolean).join('\n\n');
}

function formatExecOutput(stdout: TruncationResult, stderr: TruncationResult): string {
  return [formatOutputSection('stdout', stdout), formatOutputSection('stderr', stderr)].filter(Boolean).join('\n\n');
}

function formatOutputSection(label: string, output: TruncationResult): string {
  if (!output.content && !output.truncated) return '';

  const notice = output.truncated
    ? `\n[${label} truncated: showing ${output.outputLines} of ${output.totalLines} lines, ${formatSize(output.outputBytes)} of ${formatSize(output.totalBytes)}]`
    : '';
  return `${label}:\n${output.content}${notice}`;
}
