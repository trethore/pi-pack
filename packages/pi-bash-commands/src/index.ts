import { isToolCallEventType, type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { createActiveConfig } from '@trethore/pi-shared/config/active-config.js';

import { loadConfig } from '#src/config/config.js';
import type { PiBashCommandsConfig } from '#src/config/schema.js';
import { BASH_COMMANDS_PROMPT_MARKER, buildBashCommandsPrompt } from '#src/core/prompt.js';
import { createBashCommandsRuntime } from '#src/core/runtime.js';
import { prependBashCommandsPath } from '#src/core/shell.js';

export default function piBashCommands(pi: ExtensionAPI): void {
  const config = createActiveConfig(pi, loadConfig);
  registerBashCommands(pi, config);
}

export function registerBashCommands(pi: ExtensionAPI, config: PiBashCommandsConfig): void {
  const runtime = createBashCommandsRuntime(pi, config);

  pi.on('session_start', async (_event, ctx) => {
    await runtime.dispose();
    await runtime.ensure(ctx);
  });

  pi.on('session_shutdown', async () => {
    await runtime.dispose();
  });

  pi.on('before_agent_start', async (event, ctx) => {
    const shims = await runtime.ensure(ctx);
    if (!shims || event.systemPrompt.includes(BASH_COMMANDS_PROMPT_MARKER)) return;

    const prompt = buildBashCommandsPrompt(config.commands);
    if (!prompt) return;
    return { systemPrompt: `${event.systemPrompt}\n\n${prompt}` };
  });

  pi.on('tool_call', async (event, ctx) => {
    if (!isToolCallEventType('bash', event)) return;

    const shims = await runtime.ensure(ctx);
    if (!shims) return;
    event.input.command = prependBashCommandsPath(event.input.command, shims.directory);
  });
}
