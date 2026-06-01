import { truncateTail, type AgentToolUpdateCallback } from '@earendil-works/pi-coding-agent';

import type { EvalToolDetails } from '#src/features/eval/types.js';

const EVAL_UPDATE_THROTTLE_MS = 100;

export class StreamingEvalOutput {
  private latestOutput = '';
  private updateTimer: NodeJS.Timeout | undefined;
  private updateDirty = false;
  private lastUpdateAt = 0;

  constructor(private readonly onUpdate: AgentToolUpdateCallback<EvalToolDetails> | undefined) {
    this.onUpdate?.({ content: [], details: { exitCode: null, timedOut: false, durationMs: 0 } });
  }

  update(output: string): void {
    this.latestOutput = output;
    this.scheduleUpdate();
  }

  close(): void {
    this.clearUpdateTimer();
  }

  private scheduleUpdate(): void {
    if (!this.onUpdate) return;

    this.updateDirty = true;
    const delay = EVAL_UPDATE_THROTTLE_MS - (Date.now() - this.lastUpdateAt);
    if (delay <= 0) {
      this.clearUpdateTimer();
      this.emitUpdate();
      return;
    }

    this.updateTimer ??= setTimeout(() => {
      this.updateTimer = undefined;
      this.emitUpdate();
    }, delay);
  }

  private emitUpdate(): void {
    if (!this.onUpdate || !this.updateDirty) return;

    this.updateDirty = false;
    this.lastUpdateAt = Date.now();
    const truncation = truncateTail(this.latestOutput);
    this.onUpdate({
      content: [{ type: 'text', text: truncation.content }],
      details: { exitCode: null, timedOut: false, durationMs: 0 },
    });
  }

  private clearUpdateTimer(): void {
    if (!this.updateTimer) return;

    clearTimeout(this.updateTimer);
    this.updateTimer = undefined;
  }
}
