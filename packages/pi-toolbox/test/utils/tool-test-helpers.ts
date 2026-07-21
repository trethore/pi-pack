import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Component } from '@earendil-works/pi-tui';
import { afterEach, expect } from 'vitest';

const RENDER_WIDTH = 240;
const temporaryDirectories = new Set<string>();

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
  renderResult:
    | ((result: TResult, options: { expanded: boolean; isPartial: boolean }, theme: never, context: never) => Component)
    | undefined,
  result: TResult,
  options: { expanded: boolean; isPartial: boolean },
  isError = false
): string {
  return renderComponent(renderResult?.(result, options, createTheme(), createRenderContext(isError)));
}

export function makeTempDir(prefix: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  temporaryDirectories.add(directory);
  return directory;
}
