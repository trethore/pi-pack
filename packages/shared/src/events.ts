import type { ExtensionEvent } from "@earendil-works/pi-coding-agent";

export const Events = {
  SessionStart: "session_start",
  SessionShutdown: "session_shutdown",
  TurnStart: "turn_start",
  TurnEnd: "turn_end",
} as const satisfies Record<string, ExtensionEvent["type"]>;
