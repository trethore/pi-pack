import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getAgentDir, type ExtensionAPI } from '@earendil-works/pi-coding-agent';

const PAYLOAD_DUMP_FILE_PREFIX = '.payload-dump-';

interface PayloadDumpState {
  armed: boolean;
}

export function registerPayloadDumpCommand(pi: ExtensionAPI) {
  const state: PayloadDumpState = { armed: false };

  pi.registerCommand('payloaddump', {
    description: 'Dump the next LLM provider request payload to ~/.pi/agent/',
    handler: async (_args, ctx) => {
      state.armed = true;
      ctx.ui.notify('Will dump the next LLM provider request payload', 'info');
    },
  });

  pi.on('before_provider_request', async (event, ctx) => {
    if (!state.armed) return;

    state.armed = false;
    const filePath = await dumpProviderPayload(event.payload);
    ctx.ui.notify(`LLM payload dumped to ${filePath}`, 'info');
  });
}

export async function dumpProviderPayload(
  payload: unknown,
  options: { now?: Date; outputDirectory?: string } = {}
): Promise<string> {
  const outputDirectory = options.outputDirectory ?? getAgentDir();
  await mkdir(outputDirectory, { recursive: true });

  const filePath = path.join(
    outputDirectory,
    `${PAYLOAD_DUMP_FILE_PREFIX}${formatFileTimestamp(options.now ?? new Date())}`
  );
  await writeFile(filePath, `${stringifyPayload(payload)}\n`, 'utf8');
  return filePath;
}

function formatFileTimestamp(date: Date): string {
  return date.toISOString().replaceAll(':', '-');
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
