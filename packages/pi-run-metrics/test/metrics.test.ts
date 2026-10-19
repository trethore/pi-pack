import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RunMetrics } from "#src/metrics";

let now: number;

beforeEach(() => {
  now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
});

afterEach(() => vi.restoreAllMocks());

it("aggregates only the current run and excludes tool time from throughput", () => {
  // Arrange
  const metrics = new RunMetrics("<cost> | <tokps> | <timetaken> | <input_tokens> | <output_tokens>");
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
  const metrics = new RunMetrics("<input_tokens> <timetaken>");
  metrics.start();
  metrics.completeRequest({ usage: { input: 10 } });
  now = 1000;

  // Act
  metrics.start();
  metrics.completeRequest({ usage: { input: 20 } });

  // Assert
  expect(metrics.render()).toBe("30 1s");
});

it("resets all counters and timers for the next user run", () => {
  // Arrange
  const metrics = new RunMetrics("<cost> <tokps> <timetaken> <input_tokens> <output_tokens>");
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
  const metrics = new RunMetrics("<timetaken>");
  metrics.start();

  // Act
  now = milliseconds;

  // Assert
  expect(metrics.render()).toBe(expected);
});

it("keeps unknown placeholders and replaces repeated known placeholders", () => {
  // Arrange
  const metrics = new RunMetrics("<input_tokens>/<input_tokens> <unknown> <ouput_tokens>");
  metrics.start();

  // Act
  metrics.completeRequest({ usage: { input: 12 } });

  // Assert
  expect(metrics.render()).toBe("12/12 <unknown> <ouput_tokens>");
});

it.each([
  ["", ""],
  ["literal", "literal"],
  ["<input_tokens><output_tokens>", "123"],
  ["<<input_tokens>>", "<12>"],
  ["<constructor> <toString> <__proto__>", "<constructor> <toString> <__proto__>"],
  ["<COST> <cost <tokps_extra>", "<COST> <cost <tokps_extra>"],
])("preserves literal text and resolves exact tokens in %s", (format, expected) => {
  // Arrange
  const metrics = new RunMetrics(format);
  metrics.start();

  // Act
  metrics.completeRequest({ usage: { input: 12, output: 3 } });

  // Assert
  expect(metrics.render()).toBe(expected);
});

it("renders current values each time from the parsed format", () => {
  // Arrange
  const metrics = new RunMetrics("<input_tokens>/<input_tokens> <timetaken>");
  metrics.start();
  metrics.completeRequest({ usage: { input: 12 } });
  expect(metrics.render()).toBe("12/12 0s");

  // Act
  now = 2000;
  metrics.completeRequest({ usage: { input: 3 } });

  // Assert
  expect(metrics.render()).toBe("15/15 2s");
});

it.each([
  ["literal", false, false, false],
  ["<unknown>", false, false, false],
  ["<timetaken>", false, false, true],
  ["<cost>", false, true, false],
  ["<input_tokens>", false, true, false],
  ["<output_tokens>", false, true, false],
  ["<tokps>", true, true, false],
  ["<tokps><output_tokens><cost>", true, true, false],
  ["<timetaken><tokps><cost>", true, true, true],
])("derives collection requirements for %s", (format, needsSpeed, needsUsage, needsDuration) => {
  // Arrange
  const metrics = new RunMetrics(format);

  // Act
  const requirements = {
    needsSpeed: metrics.needsSpeed,
    needsUsage: metrics.needsUsage,
    needsDuration: metrics.needsDuration,
  };

  // Assert
  expect(requirements).toEqual({ needsSpeed, needsUsage, needsDuration });
});

it.each(["", "literal", "<cost>", "<input_tokens>", "<output_tokens>"])(
  "does not read a clock without timing placeholders in %s",
  (format) => {
    // Arrange
    const metrics = new RunMetrics(format);

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
  const metrics = new RunMetrics(format);
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
  const metrics = new RunMetrics(format);
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
  const metrics = new RunMetrics("<cost> <tokps> <input_tokens> <output_tokens>");
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
  const metrics = new RunMetrics("<input_tokens> <output_tokens> <cost>");
  metrics.start();

  // Act
  metrics.completeRequest({ usage: { input: value, output: value, cost: { total: value } } });

  // Assert
  expect(metrics.render()).toBe("N/A N/A N/A");
});

it.each(["error", "aborted"])("does not treat zero-filled %s usage as real usage", (stopReason) => {
  // Arrange
  const metrics = new RunMetrics("<input_tokens> <output_tokens> <cost>");
  metrics.start();

  // Act
  metrics.completeRequest({ stopReason, usage: { input: 0, output: 0, totalTokens: 0, cost: { total: 0 } } });

  // Assert
  expect(metrics.render()).toBe("N/A N/A N/A");
});

it("retains provider-reported partial usage on an aborted request", () => {
  // Arrange
  const metrics = new RunMetrics("<input_tokens> <output_tokens> <cost>");
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
  const metrics = new RunMetrics("<tokps> <input_tokens> <output_tokens> <cost>");
  metrics.start();
  metrics.startRequest();

  // Act
  metrics.completeRequest({ usage: { input: 0, output: 0, cost: { total: 0 } } });

  // Assert
  expect(metrics.render()).toBe("N/A 0 0 $0.0000");
});

it("ignores usage outside an active run", () => {
  // Arrange
  const metrics = new RunMetrics("<input_tokens>");

  // Act
  metrics.completeRequest({ usage: { input: 10 } });
  metrics.start();

  // Assert
  expect(metrics.render()).toBe("0");
});
