import type { ExtensionEvent } from "@earendil-works/pi-coding-agent";

export const Events = {
  AgentStart: "agent_start",
  AgentSettled: "agent_settled",
  BeforeProviderRequest: "before_provider_request",
  MessageEnd: "message_end",
  SessionStart: "session_start",
  SessionShutdown: "session_shutdown",
  ToolExecutionEnd: "tool_execution_end",
  TurnStart: "turn_start",
  TurnEnd: "turn_end",
} as const satisfies Record<string, ExtensionEvent["type"]>;
