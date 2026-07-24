import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, type TruncationResult } from '@earendil-works/pi-coding-agent';
import type { Component } from '@earendil-works/pi-tui';
import { afterEach, expect } from 'vitest';

const RENDER_WIDTH = 240;
const temporaryDirectories = new Set<string>();

type ToolResultRenderer<TResult> = (
  result: TResult,
  options: { expanded: boolean; isPartial: boolean },
  theme: never,
  context: never
) => Component;

afterEach(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { force: true, recursive: true });
  }
  temporaryDirectories.clear();
});

export function createPi() {
  const state = {
    tools: [] as { name: string }[],
    handlers: {} as Record<string, (event: unknown) => unknown>,
  };

  return {
    get tools() {
      return state.tools;
    },
    get handlers() {
      return state.handlers;
    },
    extensionApi: {
      registerTool(tool: { name: string }) {
        state.tools.push(tool);
      },
      on(event: string, handler: (event: unknown) => unknown) {
        state.handlers[event] = handler;
      },
    } as never,
  };
}

export function createRenderContext(isError: boolean) {
  return {
    args: {},
    toolCallId: 'call-id',
    invalidate: () => {},
    lastComponent: undefined,
    state: {},
    cwd: process.cwd(),
    executionStarted: true,
    argsComplete: true,
    isPartial: false,
    expanded: false,
    showImages: false,
    isError,
  } as never;
}

export function createTheme() {
  return {
    bold: (value: string) => value,
    fg: (color: string, value: string) => `<${color}>${value}</${color}>`,
  } as never;
}

export function renderComponent(component: Component | undefined): string {
  return component?.render(RENDER_WIDTH).join('\n') ?? '';
}

export function createLineOutput(lineCount: number): string {
  return Array.from({ length: lineCount }, (_value, index) => `line ${index + 1}`).join('\n');
}

export function expectSummaryOnlyCollapsedOutputWithExpansionHint(rendered: string, lineCount: number): void {
  expect(rendered).toContain('<toolOutput>line 1</toolOutput>');
  expect(rendered).not.toContain(`<toolOutput>line ${lineCount}</toolOutput>`);
  expect(rendered).toContain(`${lineCount - 1} more lines`);
  expect(rendered).toContain('to expand');
}

export function renderToolResult<TResult>(
  renderResult: ToolResultRenderer<TResult> | undefined,
  result: TResult,
  options: { expanded: boolean; isPartial: boolean },
  isError = false
): string {
  return renderComponent(renderResult?.(result, options, createTheme(), createRenderContext(isError)));
}

export function expectCollapsedTruncatedResult<TResult>(
  renderResult: ToolResultRenderer<TResult> | undefined,
  result: TResult,
  fullOutputPath: string
): void {
  const rendered = renderToolResult(renderResult, result, { expanded: false, isPartial: false });
  expect(rendered).toContain(`Full output: ${fullOutputPath}`);
  expect(rendered).toContain('Truncated:');
}

export function makeTempDir(prefix: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  temporaryDirectories.add(directory);
  return directory;
}

export function trackTempDir(directory: string): void {
  temporaryDirectories.add(directory);
}

interface PersistedTruncatedResult {
  content: Array<{ type: string; text?: string }>;
  details?: PersistedTruncatedDetails;
}

interface PersistedTruncatedDetails {
  limited: boolean;
  truncation?: TruncationResult;
  fullOutputPath?: string;
}

export function expectPersistedTruncatedResult(
  result: PersistedTruncatedResult,
  options: { truncatedBy: 'lines' | 'bytes'; fullOutputIncludes: string[] }
): string {
  const outputText = requireTextOutput(result);
  const details = requirePersistedTruncatedDetails(result);
  expect(details.limited).toBe(true);
  const truncation = requireTruncation(details);
  expect(truncation.truncatedBy).toBe(options.truncatedBy);
  expect(truncation.content.split('\n').length).toBeLessThanOrEqual(DEFAULT_MAX_LINES);
  expect(Buffer.byteLength(truncation.content, 'utf8')).toBeLessThanOrEqual(DEFAULT_MAX_BYTES);

  const fullOutputPath = requireFullOutputPath(details);
  trackTempDir(path.dirname(fullOutputPath));
  expect(outputText).toContain('[Output truncated:');
  expect(outputText).toContain(`Full output: ${fullOutputPath}]`);

  const fullOutput = readFileSync(fullOutputPath, 'utf8');
  expectTextIncludes(fullOutput, options.fullOutputIncludes);

  return fullOutputPath;
}

function requireTextOutput(result: PersistedTruncatedResult): string {
  const output = result.content[0];
  if (output?.type !== 'text' || output.text === undefined) throw new Error('expected text output');
  return output.text;
}

function requirePersistedTruncatedDetails(result: PersistedTruncatedResult): PersistedTruncatedDetails {
  if (!result.details) throw new Error('expected result details');
  return result.details;
}

function requireTruncation(details: PersistedTruncatedDetails): TruncationResult {
  if (!details.truncation) throw new Error('expected truncation details');
  return details.truncation;
}

function requireFullOutputPath(details: PersistedTruncatedDetails): string {
  if (!details.fullOutputPath) throw new Error('expected full output path');
  return details.fullOutputPath;
}

function expectTextIncludes(text: string, expectedTexts: readonly string[]): void {
  for (const expectedText of expectedTexts) {
    expect(text).toContain(expectedText);
  }
}
