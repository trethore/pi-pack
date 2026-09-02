export const NOTIFICATION_PROTOCOL = {
  OSC_777: 'osc777',
  OSC_99: 'osc99',
  OSC_9: 'osc9',
} as const;

export const AUTO_NOTIFICATION_PROTOCOL = 'auto';

export type NotificationProtocol = (typeof NOTIFICATION_PROTOCOL)[keyof typeof NOTIFICATION_PROTOCOL];
export type NotificationProtocolSetting = NotificationProtocol | typeof AUTO_NOTIFICATION_PROTOCOL;

export const notificationProtocolSettings = [
  AUTO_NOTIFICATION_PROTOCOL,
  NOTIFICATION_PROTOCOL.OSC_777,
  NOTIFICATION_PROTOCOL.OSC_99,
  NOTIFICATION_PROTOCOL.OSC_9,
] as const;

export interface NotificationSequenceOptions {
  id: string;
  message: string;
  unfocusedOnly: boolean;
}

const ESCAPE = '\u001B';
const OSC = `${ESCAPE}]`;
const ST = `${ESCAPE}\\`;
const MAX_OSC_99_PAYLOAD_BYTES = 2048;
const NOTIFICATION_PROTOCOL_PRETTY_NAMES: Record<NotificationProtocol, string> = {
  [NOTIFICATION_PROTOCOL.OSC_777]: 'OSC 777',
  [NOTIFICATION_PROTOCOL.OSC_99]: 'OSC 99',
  [NOTIFICATION_PROTOCOL.OSC_9]: 'OSC 9',
};

export function resolveNotificationProtocol(
  setting: NotificationProtocolSetting,
  environment: NodeJS.ProcessEnv = process.env
): NotificationProtocol {
  return setting === AUTO_NOTIFICATION_PROTOCOL ? detectNotificationProtocol(environment) : setting;
}

export function detectNotificationProtocol(environment: NodeJS.ProcessEnv = process.env): NotificationProtocol {
  const termProgram = environment.TERM_PROGRAM?.toLowerCase() ?? '';
  const term = environment.TERM?.toLowerCase() ?? '';

  if (isKitty(environment, termProgram, term)) return NOTIFICATION_PROTOCOL.OSC_99;
  if (isIterm2(environment, termProgram)) return NOTIFICATION_PROTOCOL.OSC_9;
  if (environment.TERM_FEATURES?.includes('No')) return NOTIFICATION_PROTOCOL.OSC_9;
  return NOTIFICATION_PROTOCOL.OSC_777;
}

function isKitty(environment: NodeJS.ProcessEnv, termProgram: string, term: string): boolean {
  return [Boolean(environment.KITTY_WINDOW_ID), termProgram === 'kitty', term.includes('kitty')].includes(true);
}

function isIterm2(environment: NodeJS.ProcessEnv, termProgram: string): boolean {
  return Boolean(environment.ITERM_SESSION_ID) || termProgram === 'iterm.app';
}

export function buildNotificationSequence(
  protocol: NotificationProtocol,
  options: NotificationSequenceOptions
): string {
  switch (protocol) {
    case NOTIFICATION_PROTOCOL.OSC_777: {
      return buildOsc777Sequence(options.message);
    }
    case NOTIFICATION_PROTOCOL.OSC_99: {
      return buildOsc99Sequence(options);
    }
    case NOTIFICATION_PROTOCOL.OSC_9: {
      return buildOsc9Sequence(options.message);
    }
  }
}

export function getNotificationProtocolPrettyName(protocol: NotificationProtocol): string {
  return NOTIFICATION_PROTOCOL_PRETTY_NAMES[protocol];
}

function buildOsc777Sequence(message: string): string {
  return `${OSC}777;notify;Pi;${sanitizeLegacyPayload(message)}${ST}`;
}

function buildOsc9Sequence(message: string): string {
  const sanitizedMessage = sanitizeLegacyPayload(message);
  const safeMessage = /^\d+;/u.test(sanitizedMessage) ? `Pi: ${sanitizedMessage}` : sanitizedMessage;
  return `${OSC}9;${safeMessage}${ST}`;
}

function buildOsc99Sequence(options: NotificationSequenceOptions): string {
  const displayPolicy = options.unfocusedOnly ? 'unfocused' : 'always';
  const titleSequence = buildOsc99Chunk(options.id, 'title', 'Pi', false, displayPolicy);
  const bodyChunks = chunkUtf8(options.message, MAX_OSC_99_PAYLOAD_BYTES);
  const bodySequences = bodyChunks.map((chunk, index) =>
    buildOsc99Chunk(options.id, 'body', chunk, index === bodyChunks.length - 1, displayPolicy)
  );
  return [titleSequence, ...bodySequences].join('');
}

function buildOsc99Chunk(
  id: string,
  payloadType: 'title' | 'body',
  payload: string,
  done: boolean,
  displayPolicy: 'always' | 'unfocused'
): string {
  const metadata = `i=${id}:d=${done ? 1 : 0}:e=1:o=${displayPolicy}:p=${payloadType}`;
  return `${OSC}99;${metadata};${Buffer.from(payload).toString('base64')}${ST}`;
}

function chunkUtf8(value: string, maximumBytes: number): string[] {
  if (value.length === 0) return [''];

  const chunks: string[] = [];
  let chunk = '';
  let chunkBytes = 0;

  for (const character of value) {
    const characterBytes = Buffer.byteLength(character);
    if (chunkBytes + characterBytes > maximumBytes) {
      chunks.push(chunk);
      chunk = '';
      chunkBytes = 0;
    }

    chunk += character;
    chunkBytes += characterBytes;
  }

  if (chunk.length > 0) chunks.push(chunk);
  return chunks;
}

function sanitizeLegacyPayload(value: string): string {
  let sanitizedValue = '';
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    sanitizedValue += codePoint <= 31 || (codePoint >= 127 && codePoint <= 159) ? ' ' : character;
  }
  return sanitizedValue;
}
