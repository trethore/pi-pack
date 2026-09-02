import { describe, expect, it } from 'vitest';

import {
  buildNotificationSequence,
  detectNotificationProtocol,
  getNotificationProtocolPrettyName,
  NOTIFICATION_PROTOCOL,
  resolveNotificationProtocol,
} from '#pi-notify/core/protocol.js';

describe('notification protocol', () => {
  it.each([
    [{ KITTY_WINDOW_ID: '1' }, 'osc99'],
    [{ TERM_PROGRAM: 'kitty' }, 'osc99'],
    [{ TERM: 'xterm-kitty' }, 'osc99'],
    [{ ITERM_SESSION_ID: 'session' }, 'osc9'],
    [{ TERM_PROGRAM: 'iTerm.app' }, 'osc9'],
    [{ TERM_FEATURES: 'T24NoH' }, 'osc9'],
    [{ GHOSTTY_RESOURCES_DIR: '/usr/share/ghostty' }, 'osc777'],
    [{ WEZTERM_PANE: '1' }, 'osc777'],
    [{ KONSOLE_VERSION: '250400' }, 'osc777'],
    [{ TERM: 'rxvt-unicode-256color' }, 'osc777'],
    [{ TERM: 'xterm-256color' }, 'osc777'],
  ] as const)('detects %o as %s', (environment, expectedProtocol) => {
    expect(detectNotificationProtocol(environment)).toBe(expectedProtocol);
  });

  it('uses an explicit override instead of environment detection', () => {
    expect(resolveNotificationProtocol('osc777', { KITTY_WINDOW_ID: '1' })).toBe('osc777');
  });

  it.each([
    [NOTIFICATION_PROTOCOL.OSC_777, 'OSC 777'],
    [NOTIFICATION_PROTOCOL.OSC_99, 'OSC 99'],
    [NOTIFICATION_PROTOCOL.OSC_9, 'OSC 9'],
  ] as const)('formats %s as %s', (protocol, prettyName) => {
    expect(getNotificationProtocolPrettyName(protocol)).toBe(prettyName);
  });

  it('builds OSC 777 notifications and removes control characters', () => {
    const sequence = buildNotificationSequence('osc777', {
      id: 'ignored',
      message: 'Ready\nnow\u001B\\',
      unfocusedOnly: false,
    });

    expect(sequence).toBe('\u001B]777;notify;Pi;Ready now \\\u001B\\');
  });

  it('builds OSC 9 notifications without colliding with progress reports', () => {
    const sequence = buildNotificationSequence('osc9', {
      id: 'ignored',
      message: '4;done',
      unfocusedOnly: false,
    });

    expect(sequence).toBe('\u001B]9;Pi: 4;done\u001B\\');
  });

  it('builds base64 OSC 99 notifications with the unfocused policy', () => {
    const sequence = buildNotificationSequence('osc99', {
      id: 'notification-1',
      message: 'Ready\nnow',
      unfocusedOnly: true,
    });

    expect(sequence).toBe(
      '\u001B]99;i=notification-1:d=0:e=1:o=unfocused:p=title;UGk=\u001B\\' +
        '\u001B]99;i=notification-1:d=1:e=1:o=unfocused:p=body;UmVhZHkKbm93\u001B\\'
    );
  });

  it('chunks long OSC 99 payloads without splitting UTF-8 characters', () => {
    const message = '😀'.repeat(600);
    const sequence = buildNotificationSequence('osc99', {
      id: 'notification-1',
      message,
      unfocusedOnly: false,
    });
    const payloads = extractOsc99BodyPayloads(sequence);

    const decodedMessage = payloads.map((payload) => Buffer.from(payload, 'base64').toString()).join('');

    expect(payloads).toHaveLength(2);
    expect(decodedMessage).toBe(message);
  });
});

function extractOsc99BodyPayloads(sequence: string): string[] {
  const prefix = '\u001B]99;';
  const terminator = '\u001B\\';
  return sequence
    .split(prefix)
    .slice(1)
    .filter((part) => part.includes(':p=body;'))
    .map((part) => part.slice(part.indexOf(';') + 1, -terminator.length));
}
