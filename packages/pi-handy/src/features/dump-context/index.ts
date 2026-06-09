import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getAgentDir, type ExtensionAPI } from '@earendil-works/pi-coding-agent';

const CONTEXT_DUMP_FILE_PREFIX = '.context-dump-';

interface DumpContextState {
  armed: boolean;
}

export function registerDumpContextCommand(pi: ExtensionAPI) {
  const state: DumpContextState = { armed: false };

  pi.registerCommand('dumpcontext', {
    description: 'Dump the next LLM provider request payload to ~/.pi/agent/',
    handler: async (_args, ctx) => {
      state.armed = true;
      ctx.ui.notify('Will dump the next LLM provider request payload', 'info');
    },
  });

  pi.on('before_provider_request', async (event, ctx) => {
    if (!state.armed) return;

    state.armed = false;
    const filePath = await dumpProviderRequestPayload(event.payload);
    ctx.ui.notify(`LLM context dumped to ${filePath}`, 'info');
  });
}

export async function dumpProviderRequestPayload(
  payload: unknown,
  options: { now?: Date; outputDirectory?: string } = {}
): Promise<string> {
  const outputDirectory = options.outputDirectory ?? getAgentDir();
  await mkdir(outputDirectory, { recursive: true });

  const filePath = path.join(
    outputDirectory,
    `${CONTEXT_DUMP_FILE_PREFIX}${(options.now ?? new Date()).toISOString()}`
  );
  await writeFile(filePath, `${stringifyPayload(payload)}\n`, 'utf8');
  return filePath;
}

export function stringifyPayload(payload: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(
    payload,
    (_key, value: unknown) => {
      if (typeof value !== 'object' || value === null) return value;
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
      return value;
    },
    2
  );
}
