import { expect, it } from "vitest";
import { Events } from "@pi-pack/shared/events";

it("keeps the Pi event names used by extensions", () => {
  // Act / Assert
  expect(Events).toEqual({
    AgentStart: "agent_start",
    AgentSettled: "agent_settled",
    BeforeAgentStart: "before_agent_start",
    BeforeProviderRequest: "before_provider_request",
    Input: "input",
    MessageEnd: "message_end",
    SessionStart: "session_start",
    SessionShutdown: "session_shutdown",
    ToolExecutionEnd: "tool_execution_end",
    TurnStart: "turn_start",
    TurnEnd: "turn_end",
  });
});
