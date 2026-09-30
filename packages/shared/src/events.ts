import type { ExtensionEvent } from "@earendil-works/pi-coding-agent";

export const Events = {
  SessionStart: "session_start",
  SessionShutdown: "session_shutdown",
  BeforeAgentStart: "before_agent_start",
  TurnStart: "turn_start",
  TurnEnd: "turn_end",
  ToolCall: "tool_call",
  ToolExecutionEnd: "tool_execution_end",
} as const satisfies Record<string, ExtensionEvent["type"]>;
