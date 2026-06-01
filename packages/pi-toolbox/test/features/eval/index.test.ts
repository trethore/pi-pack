import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createEvalToolDefinition, registerEvalTool } from '#pi-toolbox/features/eval/index.js';
import { runEval } from '#pi-toolbox/features/eval/runner.js';
import {
  createPi,
  createRenderContext,
  createTheme,
  makeTempDir as makePrefixedTempDir,
  renderComponent,
} from '#test/utils/tool-test-helpers.js';

const DEFAULT_EVAL_CONFIG = {
  enabled: true,
  defaultTimeoutMs: 10_000,
  node: { enabled: true, command: 'node', args: [] },
  python: { enabled: true, command: 'python3', args: [] },
};

describe('eval tool', () => {
  it('does not register when disabled', () => {
    // Arrange
    const pi = createPi();

    // Act
    registerEvalTool(pi.extensionApi, { eval: { ...DEFAULT_EVAL_CONFIG, enabled: false } });

    // Assert
    expect(pi.tools).toEqual([]);
  });

  it('does not register when no runtimes are enabled', () => {
    // Arrange
    const pi = createPi();

    // Act
    registerEvalTool(pi.extensionApi, {
      eval: {
        ...DEFAULT_EVAL_CONFIG,
        node: { ...DEFAULT_EVAL_CONFIG.node, enabled: false },
        python: { ...DEFAULT_EVAL_CONFIG.python, enabled: false },
      },
    });

    // Assert
    expect(pi.tools).toEqual([]);
  });

  it('registers the eval tool when enabled', () => {
    // Arrange
    const pi = createPi();

    // Act
    registerEvalTool(pi.extensionApi, { eval: DEFAULT_EVAL_CONFIG });

    // Assert
    expect(pi.tools.map((tool) => tool.name)).toEqual(['eval']);
  });

  it('marks non-zero and timed out calls as errors for shell rendering', () => {
    // Arrange
    const pi = createPi();
    registerEvalTool(pi.extensionApi, { eval: DEFAULT_EVAL_CONFIG });

    // Act
    const nonZeroResult = pi.handlers.tool_result?.({
      toolName: 'eval',
      details: { exitCode: 1, timedOut: false, durationMs: 10 },
    });
    const timedOutResult = pi.handlers.tool_result?.({
      toolName: 'eval',
      details: { exitCode: null, timedOut: true, durationMs: 10 },
    });

    // Assert
    expect(nonZeroResult).toEqual({ isError: true });
    expect(timedOutResult).toEqual({ isError: true });
  });

  it('injects configured defaults and enabled languages into the tool schema', () => {
    // Arrange and act
    const tool = createEvalToolDefinition({
      ...DEFAULT_EVAL_CONFIG,
      defaultTimeoutMs: 1234,
      maxTimeoutMs: 5000,
      python: { ...DEFAULT_EVAL_CONFIG.python, enabled: false },
    });
    const properties = (
      tool.parameters as never as {
        properties: {
          language: { enum: string[]; description: string };
          timeoutMs: { maximum: number; description: string };
          cwd: { description: string };
        };
      }
    ).properties;

    // Assert
    expect(properties.language.enum).toEqual(['node']);
    expect(properties.language.description).toContain('node: node');
    expect(properties.timeoutMs.maximum).toBe(5000);
    expect(properties.timeoutMs.description).toBe(
      'Timeout in milliseconds. If omitted, defaults to 1234ms. Maximum timeout: 5000ms.'
    );
    expect(properties.cwd.description).toBe(
      'Working directory for the subprocess. Relative paths are resolved from the current workspace. If omitted, uses the current workspace.'
    );
  });

  it('omits max timeout text when maxTimeoutMs is not configured', () => {
    // Arrange and act
    const tool = createEvalToolDefinition(DEFAULT_EVAL_CONFIG);
    const properties = (
      tool.parameters as never as {
        properties: { timeoutMs: { description: string; maximum?: number } };
      }
    ).properties;

    // Assert
    expect(properties.timeoutMs.description).toBe(
      'Timeout in milliseconds. If omitted, defaults to 10000ms.'
    );
    expect(properties.timeoutMs.maximum).toBeUndefined();
  });

  it('uses config defaults and clamps timeout to maxTimeoutMs', async () => {
    // Arrange
    const cwd = makeTempDir();
    const runner = vi.fn(async () => ({
      output: 'ok\n',
      exitCode: 0,
      timedOut: false,
      durationMs: 25,
    }));
    const tool = createEvalToolDefinition(
      { ...DEFAULT_EVAL_CONFIG, defaultTimeoutMs: 20_000, maxTimeoutMs: 5000 },
      { cwd, runner }
    );

    // Act
    const result = await tool.execute(
      'call-id',
      { language: 'node', code: 'console.log("ok")' },
      undefined,
      undefined,
      {} as never
    );

    // Assert
    expect(runner).toHaveBeenCalledWith({
      cwd,
      language: 'node',
      code: 'console.log("ok")',
      runtime: DEFAULT_EVAL_CONFIG.node,
      timeoutMs: 5000,
      signal: undefined,
      onOutput: expect.any(Function),
    });
    expect(result.content).toEqual([{ type: 'text', text: 'ok\n\n[exitCode=0, duration=25ms]' }]);
    expect(result.details).toEqual({
      exitCode: 0,
      timedOut: false,
      durationMs: 25,
      truncation: undefined,
      fullOutputPath: undefined,
    });
  });

  it('resolves cwd relative to the tool cwd and forwards it to the runner', async () => {
    // Arrange
    const cwd = makeTempDir();
    mkdirSync(path.join(cwd, 'nested'));
    const runner = vi.fn(async () => ({
      output: 'ok\n',
      exitCode: 0,
      timedOut: false,
      durationMs: 25,
    }));
    const tool = createEvalToolDefinition(DEFAULT_EVAL_CONFIG, { cwd, runner });

    // Act
    await tool.execute(
      'call-id',
      { language: 'node', code: 'console.log(process.cwd())', cwd: 'nested' },
      undefined,
      undefined,
      {} as never
    );

    // Assert
    expect(runner).toHaveBeenCalledWith(expect.objectContaining({ cwd: path.join(cwd, 'nested') }));
  });

  it('fails when cwd does not exist', async () => {
    // Arrange
    const cwd = makeTempDir();
    const runner = vi.fn(async () => ({
      output: '',
      exitCode: 0,
      timedOut: false,
      durationMs: 0,
    }));
    const tool = createEvalToolDefinition(DEFAULT_EVAL_CONFIG, { cwd, runner });

    // Act and assert
    await expect(
      tool.execute(
        'call-id',
        { language: 'node', code: 'console.log(1)', cwd: 'missing' },
        undefined,
        undefined,
        {} as never
      )
    ).rejects.toThrow('eval failed: cwd does not exist');
    expect(runner).not.toHaveBeenCalled();
  });

  it('returns timeout metadata as text', async () => {
    // Arrange
    const cwd = makeTempDir();
    const runner = vi.fn(async () => ({
      output: 'partial\n',
      exitCode: null,
      timedOut: true,
      durationMs: 52,
    }));
    const tool = createEvalToolDefinition(DEFAULT_EVAL_CONFIG, { cwd, runner });

    // Act
    const result = await tool.execute(
      'call-id',
      { language: 'python', code: 'print("partial")', timeoutMs: 50 },
      undefined,
      undefined,
      {} as never
    );

    // Assert
    expect(result.content).toEqual([
      { type: 'text', text: 'partial\n\n[timed out after 50ms, duration=52ms]' },
    ]);
    expect(result.details).toEqual(
      expect.objectContaining({ exitCode: null, timedOut: true, durationMs: 52 })
    );
  });

  it('fails when the language is disabled', async () => {
    // Arrange
    const cwd = makeTempDir();
    const runner = vi.fn(async () => ({
      output: '',
      exitCode: 0,
      timedOut: false,
      durationMs: 0,
    }));
    const tool = createEvalToolDefinition(
      { ...DEFAULT_EVAL_CONFIG, python: { ...DEFAULT_EVAL_CONFIG.python, enabled: false } },
      { cwd, runner }
    );

    // Act and assert
    await expect(
      tool.execute(
        'call-id',
        { language: 'python', code: 'print("nope")' },
        undefined,
        undefined,
        {} as never
      )
    ).rejects.toThrow('eval failed: language is disabled or unavailable: python');
    expect(runner).not.toHaveBeenCalled();
  });

  it('renders active call timeout', () => {
    // Arrange
    const tool = createEvalToolDefinition(DEFAULT_EVAL_CONFIG);

    // Act
    const rendered = renderComponent(
      tool.renderCall?.(
        { language: 'node', code: 'console.log(1)', timeoutMs: 500, cwd: 'src' },
        createTheme(),
        createRenderContext(false)
      )
    );

    // Assert
    expect(rendered).toContain(
      '<toolTitle>eval node</toolTitle><toolOutput> in src</toolOutput><muted> (timeout 500ms)</muted>'
    );
  });
});

describe('eval runner', () => {
  it('runs node code from a temporary file and removes it after execution', async () => {
    // Arrange
    const cwd = makeTempDir();
    let observedOutput = '';

    // Act
    const result = await runEval({
      cwd,
      language: 'node',
      code: 'console.log(import.meta.url)',
      runtime: DEFAULT_EVAL_CONFIG.node,
      timeoutMs: 5000,
      onOutput: (output) => {
        observedOutput = output;
      },
    });

    // Assert
    const filePath = observedOutput.trim().replace(/^file:\/\//, '');
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe(observedOutput);
    expect(path.basename(filePath)).toBe('code.mjs');
    expect(existsSync(filePath)).toBe(false);
  });

  it('runs python code with the configured command', async () => {
    // Arrange
    const cwd = makeTempDir();

    // Act
    const result = await runEval({
      cwd,
      language: 'python',
      code: 'print(21 * 2)',
      runtime: DEFAULT_EVAL_CONFIG.python,
      timeoutMs: 5000,
    });

    // Assert
    expect(result.exitCode).toBe(0);
    expect(result.output.trim()).toBe('42');
    expect(result.timedOut).toBe(false);
  });

  it('times out and returns partial output', async () => {
    // Arrange
    const cwd = makeTempDir();

    // Act
    const result = await runEval({
      cwd,
      language: 'node',
      code: 'console.log("before"); setInterval(() => {}, 1000);',
      runtime: DEFAULT_EVAL_CONFIG.node,
      timeoutMs: 50,
    });

    // Assert
    expect(result.output).toContain('before');
    expect(result.timedOut).toBe(true);
  });
});

function makeTempDir(): string {
  const cwd = makePrefixedTempDir('pi-toolbox-eval-test-');
  mkdirSync(cwd, { recursive: true });
  return cwd;
}
