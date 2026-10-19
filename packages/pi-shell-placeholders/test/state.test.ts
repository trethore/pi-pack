import { SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vitest";
import { newGeneration, restoreGeneration, STATE_TYPE } from "#src/state";

it("uses session entries as generation boundaries without a separate identifier", () => {
  // Arrange
  const session = SessionManager.inMemory();
  session.appendCustomEntry(STATE_TYPE, { version: 1, status: "resolved", customPrompt: "saved" });

  // Act
  session.appendCustomEntry(STATE_TYPE, newGeneration());

  // Assert
  expect(restoreGeneration(session.getBranch())).toEqual({ version: 1, status: "pending" });
});

it.each(["pending", "resolved"])("restores older %s state containing a generation identifier", (status) => {
  // Arrange
  const session = SessionManager.inMemory();
  session.appendCustomEntry(STATE_TYPE, {
    version: 1,
    generation: "previous-generation-id",
    status,
    customPrompt: "frozen",
    appendSystemPrompt: "addendum",
  });

  // Act
  const restored = restoreGeneration(session.getBranch());

  // Assert
  expect(restored).toEqual(
    status === "pending"
      ? { version: 1, status: "pending" }
      : { version: 1, status: "resolved", customPrompt: "frozen", appendSystemPrompt: "addendum" },
  );
});

it("distinguishes an absent custom prompt from a disabled system surface", () => {
  // Arrange
  const session = SessionManager.inMemory();
  session.appendCustomEntry(STATE_TYPE, { version: 1, status: "resolved", customPrompt: null });

  // Act
  const absent = restoreGeneration(session.getBranch());
  session.appendCustomEntry(STATE_TYPE, { version: 1, status: "resolved" });
  const disabled = restoreGeneration(session.getBranch());

  // Assert
  expect(absent).toHaveProperty("customPrompt", null);
  expect(disabled).not.toHaveProperty("customPrompt");
});

it.each([
  null,
  { version: 2, status: "pending" },
  { version: 1, status: "unknown" },
  { version: 1, status: "resolved", customPrompt: 123 },
  { version: 1, status: "resolved", appendSystemPrompt: null },
])("rejects invalid state rather than silently starting another evaluation: %j", (data) => {
  // Arrange
  const session = SessionManager.inMemory();
  session.appendCustomEntry(STATE_TYPE, data);

  // Act / Assert
  expect(() => restoreGeneration(session.getBranch())).toThrow("reload to reset");
});
