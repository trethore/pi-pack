import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { DEFAULT_MAX_BYTES } from '@earendil-works/pi-coding-agent';
import { describe, expect, it, vi } from 'vitest';

import { createEvalToolDefinition, registerEvalTool } from '#pi-toolbox/features/eval/index.js';
import { runEval } from '#pi-toolbox/features/eval/runner.js';
import { StreamingEvalOutput } from '#pi-toolbox/features/eval/streaming-output.js';
import { lines } from '#test/utils/lines.js';
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
          path: { description: string };
          inheritEnv: { description: string };
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
    expect(properties.path.description).toBe(
      'Path where the code should run. Supports both relative and absolute paths. If omitted, the current working directory is used.'
    );
    expect(properties.inheritEnv.description).toBe(
      'Whether to inherit the caller environment. If omitted, defaults to false.'
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
      inheritEnv: false,
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

  it('resolves path and inheritEnv relative to the tool cwd and forwards them to the runner', async () => {
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
      { language: 'node', code: 'console.log(process.cwd())', path: 'nested', inheritEnv: true },
      undefined,
      undefined,
      {} as never
    );

    // Assert
    expect(runner).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: path.join(cwd, 'nested'), inheritEnv: true })
    );
  });

  it('fails when path does not exist', async () => {
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
        { language: 'node', code: 'console.log(1)', path: 'missing' },
        undefined,
        undefined,
        {} as never
      )
    ).rejects.toThrow('eval failed: path does not exist');
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

  it('formats captured truncated output with the full output path', async () => {
    // Arrange
    const cwd = makeTempDir();
    const runner = vi.fn(async () => ({
      output: 'tail\n',
      exitCode: 0,
      timedOut: false,
      durationMs: 25,
      outputTruncated: true,
      outputBytes: DEFAULT_MAX_BYTES + 10,
      outputLines: 1,
      fullOutputPath: '/tmp/pi-eval-output-test/output.txt',
    }));
    const tool = createEvalToolDefinition(DEFAULT_EVAL_CONFIG, { cwd, runner });

    // Act
    const result = await tool.execute(
      'call-id',
      { language: 'node', code: 'console.log("large")' },
      undefined,
      undefined,
      {} as never
    );

    // Assert
    const textContent = result.content[0];
    expect(textContent?.type).toBe('text');
    const text = textContent?.type === 'text' ? textContent.text : '';
    expect(text).toContain('tail');
    expect(text).toContain('Showing last');
    expect(text).toContain('Full output: /tmp/pi-eval-output-test/output.txt');
    expect(result.details.fullOutputPath).toBe('/tmp/pi-eval-output-test/output.txt');
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

  it('renders active call timeout, path, and inherited environment', () => {
    // Arrange
    const tool = createEvalToolDefinition(DEFAULT_EVAL_CONFIG);

    // Act
    const rendered = renderComponent(
      tool.renderCall?.(
        {
          language: 'node',
          code: 'console.log(1)',
          timeoutMs: 500,
          path: 'src',
          inheritEnv: true,
        },
        createTheme(),
        createRenderContext(false)
      )
    );

    // Assert
    expect(rendered).toContain(
      '<toolTitle>$ node <eval></toolTitle><muted> (timeout 500ms, in src, inheritEnv)</muted>'
    );
  });

  it.each([
    ['omitted path', undefined],
    ['current path', '.'],
    ['empty path', ''],
  ])('omits path from active call when path is %s', (_name, evalPath) => {
    // Arrange
    const tool = createEvalToolDefinition(DEFAULT_EVAL_CONFIG);

    // Act
    const rendered = renderComponent(
      tool.renderCall?.(
        { language: 'node', code: 'console.log(1)', timeoutMs: 500, path: evalPath },
        createTheme(),
        createRenderContext(false)
      )
    );

    // Assert
    expect(rendered).toContain(
      '<toolTitle>$ node <eval></toolTitle><muted> (timeout 500ms)</muted>'
    );
  });
});

describe('streaming eval output', () => {
  it('emits an initial update and throttles subsequent output updates', async () => {
    // Arrange
    vi.useFakeTimers();
    vi.setSystemTime(1000);

    try {
      const onUpdate = vi.fn();
      const output = new StreamingEvalOutput(onUpdate);

      // Act
      output.update('first');
      output.update('second');

      // Assert
      expect(onUpdate).toHaveBeenCalledTimes(2);
      expect(onUpdate.mock.calls[0]?.[0]).toEqual({
        content: [],
        details: { exitCode: null, timedOut: false, durationMs: 0 },
      });
      expect(onUpdate.mock.calls[1]?.[0]?.content).toEqual([{ type: 'text', text: 'first' }]);

      await vi.advanceTimersByTimeAsync(100);
      expect(onUpdate).toHaveBeenCalledTimes(3);
      expect(onUpdate.mock.calls[2]?.[0]?.content).toEqual([{ type: 'text', text: 'second' }]);

      output.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('truncates streaming updates and clears pending updates when closed', async () => {
    // Arrange
    vi.useFakeTimers();
    vi.setSystemTime(1000);

    try {
      const onUpdate = vi.fn();
      const output = new StreamingEvalOutput(onUpdate);
      const largeOutput = 'a'.repeat(DEFAULT_MAX_BYTES + 4096);

      // Act
      output.update(largeOutput);
      output.update('pending');
      output.close();
      await vi.advanceTimersByTimeAsync(100);

      // Assert
      const streamedContent = onUpdate.mock.calls[1]?.[0]?.content[0];
      expect(streamedContent?.type).toBe('text');
      const streamedText = streamedContent?.type === 'text' ? streamedContent.text : '';
      expect(Buffer.byteLength(streamedText, 'utf8')).toBeLessThanOrEqual(DEFAULT_MAX_BYTES);
      expect(onUpdate).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
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

  it('combines stdout and stderr in output', async () => {
    // Arrange
    const cwd = makeTempDir();

    // Act
    const result = await runEval({
      cwd,
      language: 'node',
      code: 'console.log("stdout text"); console.error("stderr text");',
      runtime: DEFAULT_EVAL_CONFIG.node,
      timeoutMs: 5000,
    });

    // Assert
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('stdout text');
    expect(result.output).toContain('stderr text');
  });

  it('spills large output to a file and keeps bounded output in memory', async () => {
    // Arrange
    const cwd = makeTempDir();
    const outputBytes = DEFAULT_MAX_BYTES + 4096;

    // Act
    const result = await runEval({
      cwd,
      language: 'node',
      code: `process.stdout.write('a'.repeat(${outputBytes}))`,
      runtime: DEFAULT_EVAL_CONFIG.node,
      timeoutMs: 5000,
    });

    // Assert
    expect(result.exitCode).toBe(0);
    expect(result.outputTruncated).toBe(true);
    expect(result.outputBytes).toBe(outputBytes);
    expect(Buffer.byteLength(result.output, 'utf8')).toBeLessThanOrEqual(DEFAULT_MAX_BYTES);
    expect(result.fullOutputPath).toBeDefined();
    expect(existsSync(result.fullOutputPath ?? '')).toBe(true);
    expect(statSync(result.fullOutputPath ?? '').size).toBe(outputBytes);
  });

  it('does not inherit environment variables by default', async () => {
    // Arrange
    const cwd = makeTempDir();

    // Act
    const result = await withEnvVar('PI_TOOLBOX_EVAL_TEST_VAR', 'secret', () =>
      runEval({
        cwd,
        language: 'node',
        code: 'console.log(process.env.PI_TOOLBOX_EVAL_TEST_VAR ?? "missing")',
        runtime: DEFAULT_EVAL_CONFIG.node,
        timeoutMs: 5000,
      })
    );

    // Assert
    expect(result.exitCode).toBe(0);
    expect(result.output.trim()).toBe('missing');
  });

  it('inherits environment variables when requested', async () => {
    // Arrange
    const cwd = makeTempDir();

    // Act
    const result = await withEnvVar('PI_TOOLBOX_EVAL_TEST_VAR', 'secret', () =>
      runEval({
        cwd,
        language: 'node',
        code: 'console.log(process.env.PI_TOOLBOX_EVAL_TEST_VAR ?? "missing")',
        runtime: DEFAULT_EVAL_CONFIG.node,
        timeoutMs: 5000,
        inheritEnv: true,
      })
    );

    // Assert
    expect(result.exitCode).toBe(0);
    expect(result.output.trim()).toBe('secret');
  });

  it('rejects without running code when pre-aborted', async () => {
    // Arrange
    const cwd = makeTempDir();
    const abortController = new AbortController();
    abortController.abort();

    // Act and assert
    await expect(
      runEval({
        cwd,
        language: 'node',
        code: 'console.log("should not run")',
        runtime: DEFAULT_EVAL_CONFIG.node,
        timeoutMs: 5000,
        signal: abortController.signal,
      })
    ).rejects.toThrow('eval aborted');
  });

  it('rejects and terminates the subprocess when aborted during execution', async () => {
    // Arrange
    const cwd = makeTempDir();
    const abortController = new AbortController();
    const evalCode = lines(
      "import { writeFileSync } from 'node:fs';",
      "writeFileSync('eval-ready', String(process.pid));",
      'setInterval(() => {}, 1000);'
    );

    // Act
    const result = runEval({
      cwd,
      language: 'node',
      code: evalCode,
      runtime: DEFAULT_EVAL_CONFIG.node,
      timeoutMs: 5000,
      signal: abortController.signal,
    });
    await waitForFile(path.join(cwd, 'eval-ready'));
    const evalPid = Number(readText(path.join(cwd, 'eval-ready')));
    abortController.abort();

    // Assert
    await expect(result).rejects.toThrow('eval aborted');
    try {
      await waitForProcessExit(evalPid);
    } finally {
      killProcessIfAlive(evalPid);
    }
  });

  it('terminates subprocesses when timed out', async () => {
    // Arrange
    const cwd = makeTempDir();
    const childCode = lines(
      "const { writeFileSync } = require('node:fs');",
      "process.on('SIGTERM', () => {});",
      "writeFileSync('child-ready', String(process.pid));",
      'setInterval(() => {}, 1000);'
    );
    const evalCode = lines(
      "import { spawn } from 'node:child_process';",
      "import { existsSync, readFileSync } from 'node:fs';",
      "import { setTimeout as delay } from 'node:timers/promises';",
      '',
      `const childCode = ${JSON.stringify(childCode)};`,
      "spawn(process.execPath, ['-e', childCode], { stdio: 'ignore' });",
      "while (!existsSync('child-ready')) await delay(10);",
      "console.log(readFileSync('child-ready', 'utf8'));",
      'setInterval(() => {}, 1000);'
    );

    // Act
    const result = await runEval({
      cwd,
      language: 'node',
      code: evalCode,
      runtime: DEFAULT_EVAL_CONFIG.node,
      timeoutMs: 500,
    });
    const childPid = Number(result.output.trim());

    // Assert
    expect(result.timedOut).toBe(true);
    expect(Number.isInteger(childPid)).toBe(true);
    try {
      await waitForProcessExit(childPid);
    } finally {
      killProcessIfAlive(childPid);
    }
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

async function withEnvVar<T>(key: string, value: string, callback: () => Promise<T>): Promise<T> {
  const previousValue = process.env[key];
  process.env[key] = value;

  try {
    return await callback();
  } finally {
    if (previousValue === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previousValue;
    }
  }
}

async function waitForFile(filePath: string): Promise<void> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (existsSync(filePath)) return;
    await delay(25);
  }

  throw new Error(`expected file to exist: ${filePath}`);
}

function readText(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

async function waitForProcessExit(pid: number): Promise<void> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return;
    await delay(25);
  }

  throw new Error(`expected process ${pid} to exit`);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killProcessIfAlive(pid: number): void {
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    return;
  }
}

function makeTempDir(): string {
  const cwd = makePrefixedTempDir('pi-toolbox-eval-test-');
  mkdirSync(cwd, { recursive: true });
  return cwd;
}
