import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { startToolTimer, toolTimerText, type TimedRenderContext } from "#src/render-timer";

function context(overrides: Partial<TimedRenderContext> = {}): TimedRenderContext {
  return { state: {}, executionStarted: true, isError: false, invalidate: vi.fn(), ...overrides } as TimedRenderContext;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

it("starts once, redraws partial results, and stops on completion", () => {
  // Arrange
  const row = context();
  startToolTimer(row);

  // Act
  const initial = toolTimerText(row, true);
  vi.advanceTimersByTime(2200);
  startToolTimer(row);
  const partial = toolTimerText(row, true);
  const final = toolTimerText(row, false);
  vi.advanceTimersByTime(5000);

  // Assert
  expect(initial).toBe("Elapsed 0.0s");
  expect(partial).toBe("Elapsed 2.2s");
  expect(final).toBe("Took 2.2s");
  expect(toolTimerText(row, false)).toBe(final);
  expect(row.invalidate).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});

it("does not start a timer while arguments are still streaming", () => {
  // Arrange
  const row = context({ executionStarted: false });

  // Act
  startToolTimer(row);
  const text = toolTimerText(row, true);

  // Assert
  expect(text).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
});

it("stops invalidating an errored row even if it is still partial", () => {
  // Arrange
  const row = context();
  startToolTimer(row);
  toolTimerText(row, true);

  // Act
  row.isError = true;
  toolTimerText(row, true);
  vi.advanceTimersByTime(2000);

  // Assert
  expect(row.invalidate).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it.each([
  [0, "Took 0.0s"],
  [4200, "Took 4.2s"],
  [90500, "Took 1m 30s"],
  [7384000, "Took 2h 3m 4s"],
] as const)("uses the recorded duration %s when rendering saved results", (durationMs, expected) => {
  // Arrange
  const row = context({ executionStarted: false, durationMs });

  // Act
  const text = toolTimerText(row, false);

  // Assert
  expect(text).toBe(expected);
  expect(vi.getTimerCount()).toBe(0);
});

it("prefers the recorded duration over the live clock for final results", () => {
  // Arrange
  const row = context({ durationMs: 1250 });
  startToolTimer(row);
  vi.advanceTimersByTime(2000);

  // Act
  const text = toolTimerText(row, false);

  // Assert
  expect(text).toBe("Took 1.3s");
});
