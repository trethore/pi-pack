import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

const GREY_START = '\u001B[90m';
const GREY_END = '\u001B[39m';

export function registerTimeTakenFeature(pi: ExtensionAPI) {
  let agentStartMs: number | undefined;

  pi.on('agent_start', () => {
    agentStartMs = Date.now();
  });

  pi.on('message_end', (event) => {
    if (agentStartMs === undefined) return;
    if (event.message.role !== 'assistant') return;
    if (event.message.stopReason === 'toolUse') return;

    const elapsedMs = Date.now() - agentStartMs;
    agentStartMs = undefined;
    if (elapsedMs < 0) return;

    return {
      message: {
        ...event.message,
        content: [...event.message.content, { type: 'text', text: formatGreyTimeTaken(elapsedMs) }],
      },
    };
  });
}

export function formatTimeTaken(elapsedMs: number): string {
  const totalSeconds = Math.round(elapsedMs / 1000);

  if (totalSeconds < 60) return `Took ${totalSeconds}s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `Took ${minutes}m${seconds}s`;
}

export function formatGreyTimeTaken(elapsedMs: number): string {
  return `${GREY_START}${formatTimeTaken(elapsedMs)}${GREY_END}`;
}
