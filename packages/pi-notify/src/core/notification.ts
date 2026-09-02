import { performance } from 'node:perf_hooks';

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import type { PiNotifyConfig } from '#src/config/schema.js';
import {
  buildNotificationSequence,
  getNotificationProtocolPrettyName,
  NOTIFICATION_PROTOCOL,
  passthroughTmux,
  resolveNotificationProtocol,
} from '#src/core/protocol.js';

interface NotificationRuntime {
  environment?: NodeJS.ProcessEnv;
  now?(): number;
  write?(sequence: string): void;
}

export function registerNotificationFeature(
  pi: ExtensionAPI,
  config: PiNotifyConfig,
  runtime: NotificationRuntime = {}
): void {
  const environment = runtime.environment ?? process.env;
  const now = () => (runtime.now ? runtime.now() : performance.now());
  const write = (sequence: string) => {
    if (runtime.write) {
      runtime.write(sequence);
      return;
    }
    process.stdout.write(sequence);
  };
  let lastNotificationTime: number | undefined;
  let notificationId = 0;

  pi.on('session_start', (_event, ctx) => {
    if (!config.enabled || !config.unfocusedOnly) return;

    const protocol = resolveNotificationProtocol(config.protocol, environment);
    if (protocol === NOTIFICATION_PROTOCOL.OSC_99) return;

    ctx.ui.notify(
      `pi-notify unfocusedOnly requires OSC 99; ${getNotificationProtocolPrettyName(protocol)} notifications cannot detect terminal focus.`,
      'warning'
    );
  });

  pi.on('agent_settled', (_event, ctx) => {
    if (!config.enabled || ctx.mode !== 'tui') return;

    const currentTime = now();
    if (isCoolingDown(lastNotificationTime, currentTime, config.cooldown)) return;

    notificationId += 1;
    const protocol = resolveNotificationProtocol(config.protocol, environment);
    const sequence = buildNotificationSequence(protocol, {
      id: `pi-notify-${process.pid}-${notificationId}`,
      message: config.message,
      unfocusedOnly: config.unfocusedOnly,
    });
    write(passthroughTmux(sequence, environment));
    lastNotificationTime = currentTime;
  });
}

function isCoolingDown(
  lastNotificationTime: number | undefined,
  currentTime: number,
  cooldownSeconds: number
): boolean {
  if (lastNotificationTime === undefined) return false;
  return currentTime - lastNotificationTime < cooldownSeconds * 1000;
}
