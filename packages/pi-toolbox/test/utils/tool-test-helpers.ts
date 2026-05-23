import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Component } from '@earendil-works/pi-tui';

const RENDER_WIDTH = 240;

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

export function makeTempDir(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}
