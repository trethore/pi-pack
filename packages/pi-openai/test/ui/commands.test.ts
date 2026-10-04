import { expect, it } from "vitest";
import { completeArguments, parseCommand } from "#src/ui/commands";

it.each(["", " ", "status", " status "])("shows status for %j", (input) => {
  // Act / Assert
  expect(parseCommand(input)).toEqual({ type: "status" });
});

it.each([
  ["serviceTier fast", { type: "set", setting: "serviceTier", override: { serviceTier: "priority" } }],
  ["serviceTier priority", { type: "set", setting: "serviceTier", override: { serviceTier: "priority" } }],
  ["verbosity low", { type: "set", setting: "verbosity", override: { verbosity: "low" } }],
  ["reasoningSummary null", { type: "set", setting: "reasoningSummary", override: { reasoningSummary: null } }],
  ["allowUnsupported true", { type: "set", setting: "allowUnsupported", override: { allowUnsupported: true } }],
  ["reset", { type: "reset", setting: undefined }],
  ["reset verbosity", { type: "reset", setting: "verbosity" }],
  ["save", { type: "save", destination: undefined }],
  ["save project", { type: "save", destination: "project" }],
  ["save global", { type: "save", destination: "global" }],
])("parses %s", (input, expected) => {
  // Act / Assert
  expect(parseCommand(input)).toEqual(expected);
});

it.each([
  "help",
  "unknown",
  "status project",
  "save other",
  "reset other",
  "verbosity",
  "webSearch yes",
  "save project extra",
  "__proto__ true",
])("rejects invalid command %s", (input) => {
  // Act / Assert
  expect(() => parseCommand(input)).toThrow();
});

it.each([
  ["serviceTier ", ["serviceTier default", "serviceTier priority"]],
  ["serviceTier p", ["serviceTier priority"]],
  ["ver", ["verbosity"]],
  ["verbosity ", ["verbosity low", "verbosity medium", "verbosity high", "verbosity null"]],
  ["verbosity n", ["verbosity null"]],
  ["reasoningSummary n", ["reasoningSummary none", "reasoningSummary null"]],
  ["save ", ["save project", "save global"]],
  ["reset web", ["reset webSearch"]],
  ["allowUnsupported t", ["allowUnsupported true"]],
])("completes %j with full replacement arguments", (prefix, expected) => {
  // Act / Assert
  expect(completeArguments(prefix)?.map((item) => item.value)).toEqual(expected);
});

it.each(["invalid", "status ", "verbosity low extra", "save x"])("returns no completions for %j", (prefix) => {
  // Act / Assert
  expect(completeArguments(prefix)).toBeNull();
});

it("discovers all subcommands without a help command", () => {
  // Act
  const names = completeArguments("")?.map((item) => item.value);

  // Assert
  expect(names).toEqual([
    "status",
    "enabled",
    "allowUnsupported",
    "verbosity",
    "reasoningSummary",
    "webSearch",
    "serviceTier",
    "reset",
    "save",
  ]);
});
