export const BridgeMessageType = {
  Call: "call",
  Global: "global",
  Output: "output",
  Done: "done",
} as const;

export type BridgeMessageType = (typeof BridgeMessageType)[keyof typeof BridgeMessageType];
export type BridgeCallType = typeof BridgeMessageType.Call | typeof BridgeMessageType.Global;

export const BridgeOutputType = {
  Text: "text",
  Console: "console",
  Image: "image",
} as const;

export type BridgeOutputType = (typeof BridgeOutputType)[keyof typeof BridgeOutputType];

export type HostBridge = (
  ...args:
    | [kind: BridgeCallType, id: number, name: string, args: string | undefined]
    | [kind: typeof BridgeMessageType.Output, type: BridgeOutputType, data: string, mimeType?: string | undefined]
    | [kind: typeof BridgeMessageType.Done, ok: boolean, payload: string | undefined, writes?: string | undefined]
) => void;

export function isBridgeMessageType(value: unknown): value is BridgeMessageType {
  return (
    value === BridgeMessageType.Call ||
    value === BridgeMessageType.Global ||
    value === BridgeMessageType.Output ||
    value === BridgeMessageType.Done
  );
}
