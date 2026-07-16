import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

export function registerTimeTakenFeature(pi: ExtensionAPI) {
  let agentStartMs: number | undefined;

  pi.on('agent_start', () => {
    agentStartMs ??= Date.now();
  });

  pi.on('agent_settled', (_event, ctx) => {
    if (agentStartMs === undefined) return;

    const elapsedMs = Date.now() - agentStartMs;
    agentStartMs = undefined;
    if (!ctx.hasUI) return;
    if (elapsedMs < 0) return;

    ctx.ui.notify(formatTimeTaken(elapsedMs), 'info');
  });
}

export function formatTimeTaken(elapsedMs: number): string {
  const totalSeconds = Math.round(elapsedMs / 1000);

  if (totalSeconds < 60) return `Took ${totalSeconds}s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `Took ${minutes}m${seconds}s`;
}
