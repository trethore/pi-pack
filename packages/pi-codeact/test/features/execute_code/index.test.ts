import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';
import { createExecuteCodeToolDefinition, registerExecuteCodeTool } from '#pi-codeact/features/execute_code/index.js';

const config = {
  enabled: true,
  packageCachePath: '/tmp/pi-codeact-test-cache',
  defaultTimeoutSeconds: 17,
};

describe('createExecuteCodeToolDefinition', () => {
  it('fills the configured default timeout into the parameters schema', () => {
    const tool = createExecuteCodeToolDefinition(config);

    const parameters = tool.parameters as unknown as { properties: { timeout: { description: string } } };
    const timeout = parameters.properties.timeout;
    expect(tool.name).toBe('execute_code');
    expect(timeout.description).toContain('17');
  });
});

describe('registerExecuteCodeTool', () => {
  it('registers execute_code when enabled', () => {
    const tools: ToolDefinition[] = [];
    const pi = {
      registerTool(tool: ToolDefinition) {
        tools.push(tool);
      },
    } as ExtensionAPI;

    registerExecuteCodeTool(pi, { executeCode: config });

    expect(tools.map((tool) => tool.name)).toEqual(['execute_code']);
  });

  it('does not register execute_code when disabled', () => {
    const tools: ToolDefinition[] = [];
    const pi = {
      registerTool(tool: ToolDefinition) {
        tools.push(tool);
      },
    } as ExtensionAPI;

    registerExecuteCodeTool(pi, { executeCode: { ...config, enabled: false } });

    expect(tools).toEqual([]);
  });
});
