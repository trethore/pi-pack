import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TurnMetrics } from "#src/metrics";

let now: number;

beforeEach(() => {
  now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
});

afterEach(() => vi.restoreAllMocks());

it("aggregates only the current turn and excludes tool time from throughput", () => {
  // Arrange
  const metrics = new TurnMetrics("<cost> | <tokps> | <timetaken> | <input_tokens> | <output_tokens>");
  metrics.start();
  metrics.startRequest();
  now = 2000;
  metrics.completeRequest({ usage: { input: 100, output: 40, cost: { total: 0.01 } } });

  // Act
  now = 12000;
  metrics.startRequest();
  now = 15000;
  metrics.completeRequest({ usage: { input: 200, output: 60, cost: { total: 0.02 } } });

  // Assert
  expect(metrics.render()).toBe("$0.0300 | 20.0 tok/s | 15s | 300 | 100");
});

it("does not reset metrics when another agent loop starts before settling", () => {
  // Arrange
  const metrics = new TurnMetrics("<input_tokens> <timetaken>");
  metrics.start();
  metrics.completeRequest({ usage: { input: 10 } });
  now = 1000;

  // Act
  metrics.start();
  metrics.completeRequest({ usage: { input: 20 } });

  // Assert
  expect(metrics.render()).toBe("30 1s");
});

it("resets all counters and timers for the next user turn", () => {
  // Arrange
  const metrics = new TurnMetrics("<cost> <tokps> <timetaken> <input_tokens> <output_tokens>");
  metrics.start();
  metrics.startRequest();
  now = 1000;
  metrics.completeRequest({ usage: { input: 100, output: 50, cost: { total: 1 } } });
  metrics.active = false;
  now = 10000;

  // Act
  metrics.start();
  metrics.startRequest();
  now = 12000;
  metrics.completeRequest({ usage: { input: 5, output: 2, cost: { total: 0.001 } } });

  // Assert
  expect(metrics.render()).toBe("$0.0010 1.0 tok/s 2s 5 2");
});

it.each([
  [0, "0s"],
  [999, "0s"],
  [9000, "9s"],
  [60000, "1m0s"],
  [128999, "2m8s"],
  [3600000, "1h0m0s"],
  [3603000, "1h0m3s"],
  [90061000, "25h1m1s"],
])("formats %i milliseconds as %s", (milliseconds, expected) => {
  // Arrange
  const metrics = new TurnMetrics("<timetaken>");
  metrics.start();

  // Act
  now = milliseconds;

  // Assert
  expect(metrics.render()).toBe(expected);
});

it("keeps unknown placeholders and replaces repeated known placeholders", () => {
  // Arrange
  const metrics = new TurnMetrics("<input_tokens>/<input_tokens> <unknown> <ouput_tokens>");
  metrics.start();

  // Act
  metrics.completeRequest({ usage: { input: 12 } });

  // Assert
  expect(metrics.render()).toBe("12/12 <unknown> <ouput_tokens>");
});

it.each(["", "literal", "<cost>", "<input_tokens>", "<output_tokens>"])(
  "does not read a clock without timing placeholders in %s",
  (format) => {
    // Arrange
    const metrics = new TurnMetrics(format);

    // Act
    metrics.start();
    metrics.startRequest();
    metrics.completeRequest({ usage: { input: 10, output: 20, cost: { total: 0 } } });
    metrics.render();

    // Assert
    expect(performance.now).not.toHaveBeenCalled();
  },
);

it.each(["<timetaken>", "literal"])("does not read usage for %s", (format) => {
  // Arrange
  const metrics = new TurnMetrics(format);
  const usage = vi.fn(() => {
    throw new Error("Unexpected usage access");
  });
  const message = {
    get usage() {
      return usage();
    },
  };
  metrics.start();

  // Act
  metrics.completeRequest(message);
  metrics.render();

  // Assert
  expect(usage).not.toHaveBeenCalled();
});

it.each([
  ["<input_tokens>", ["input"]],
  ["<output_tokens>", ["output"]],
  ["<cost>", ["cost"]],
  ["<tokps>", ["output"]],
])("reads only the dependencies of %s", (format, expected) => {
  // Arrange
  const fields: string[] = [];
  const metrics = new TurnMetrics(format);
  const usage = {
    get input() {
      fields.push("input");
      return 1;
    },
    get output() {
      fields.push("output");
      return 2;
    },
    get cost() {
      fields.push("cost");
      return { total: 0.01 };
    },
  };
  metrics.start();
  metrics.startRequest();
  now = 1000;

  // Act
  metrics.completeRequest({ usage });
  metrics.render();

  // Assert
  expect(fields).toEqual(expected);
});

it("marks incomplete totals unavailable instead of silently undercounting", () => {
  // Arrange
  const metrics = new TurnMetrics("<cost> <tokps> <input_tokens> <output_tokens>");
  metrics.start();
  metrics.startRequest();
  now = 1000;
  metrics.completeRequest({ usage: { input: 10, output: 20 } });

  // Act
  metrics.startRequest();
  now = 2000;
  metrics.completeRequest({});

  // Assert
  expect(metrics.render()).toBe("N/A N/A N/A N/A");
});

it.each([NaN, Infinity, -1])("does not display invalid provider values: %s", (value) => {
  // Arrange
  const metrics = new TurnMetrics("<input_tokens> <output_tokens> <cost>");
  metrics.start();

  // Act
  metrics.completeRequest({ usage: { input: value, output: value, cost: { total: value } } });

  // Assert
  expect(metrics.render()).toBe("N/A N/A N/A");
});

it.each(["error", "aborted"])("does not treat zero-filled %s usage as real usage", (stopReason) => {
  // Arrange
  const metrics = new TurnMetrics("<input_tokens> <output_tokens> <cost>");
  metrics.start();

  // Act
  metrics.completeRequest({ stopReason, usage: { input: 0, output: 0, totalTokens: 0, cost: { total: 0 } } });

  // Assert
  expect(metrics.render()).toBe("N/A N/A N/A");
});

it("retains provider-reported partial usage on an aborted request", () => {
  // Arrange
  const metrics = new TurnMetrics("<input_tokens> <output_tokens> <cost>");
  metrics.start();

  // Act
  metrics.completeRequest({
    stopReason: "aborted",
    usage: { input: 10, output: 2, totalTokens: 12, cost: { total: 0.01 } },
  });

  // Assert
  expect(metrics.render()).toBe("10 2 $0.0100");
});

it("avoids division by zero and accepts legitimate zero usage", () => {
  // Arrange
  const metrics = new TurnMetrics("<tokps> <input_tokens> <output_tokens> <cost>");
  metrics.start();
  metrics.startRequest();

  // Act
  metrics.completeRequest({ usage: { input: 0, output: 0, cost: { total: 0 } } });

  // Assert
  expect(metrics.render()).toBe("N/A 0 0 $0.0000");
});

it("ignores usage outside an active turn", () => {
  // Arrange
  const metrics = new TurnMetrics("<input_tokens>");

  // Act
  metrics.completeRequest({ usage: { input: 10 } });
  metrics.start();

  // Assert
  expect(metrics.render()).toBe("0");
});
