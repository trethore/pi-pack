import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

/** Duration as `4.2s` below a minute, then `1m 30s` and `2h 3m 4s`. */
function formatToolDuration(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }

  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${remainder}s`;
  }

  return `${Math.floor(minutes / 60)}h ${minutes % 60}m ${remainder}s`;
}

/** Renderer state of {@link startToolTimer} and {@link toolTimerText}, kept in `ToolRenderContext.state`. */
export interface ToolTimerState {
  startedAt?: number;
  endedAt?: number | undefined;
  interval?: ReturnType<typeof setInterval> | undefined;
}

export type TimedRenderContext = Parameters<
  NonNullable<ToolDefinition<ToolDefinition["parameters"], unknown, ToolTimerState>["renderResult"]>
>[3];

/** Start the row's clock once execution starts. Call from `renderCall`. */
export function startToolTimer(context: TimedRenderContext): void {
  const state = context.state;
  if (context.executionStarted && state.startedAt === undefined) {
    state.startedAt = Date.now();
    state.endedAt = undefined;
  }
}

/**
 * The row's timing line, from `renderResult`: `Elapsed 4.2s` while the result is partial, redrawn
 * every second, and `Took 4.2s` once it is final. Undefined when the row has no start time and no
 * recorded duration.
 */
function updateTimer(context: TimedRenderContext, isPartial: boolean): void {
  const state = context.state;
  if (state.startedAt !== undefined && isPartial && !state.interval) {
    state.interval = setInterval(() => context.invalidate(), 1000);
  }
  if (!isPartial || context.isError) {
    state.endedAt ??= Date.now();
    if (state.interval) {
      clearInterval(state.interval);
      state.interval = undefined;
    }
  }
}

export function toolTimerText(context: TimedRenderContext, isPartial: boolean): string | undefined {
  updateTimer(context, isPartial);
  const state = context.state;
  // A final result's recorded duration wins: it is monotonic and survives reloads. The renderer's own clock is the
  // fallback for live progress and for results stored without one.
  if (!isPartial && context.durationMs !== undefined) {
    return `Took ${formatToolDuration(context.durationMs)}`;
  }
  if (state.startedAt === undefined) {
    return undefined;
  }
  const endTime = state.endedAt ?? Date.now();
  return `${isPartial ? "Elapsed" : "Took"} ${formatToolDuration(endTime - state.startedAt)}`;
}
