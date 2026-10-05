import { expect, it } from "vitest";
import { completeArguments, parseCommand } from "#src/ui/commands";

it.each(["", " ", "status", " status "])("shows status for %j", (input) => {
  // Act / Assert
  expect(parseCommand(input)).toEqual({ type: "status" });
});

it.each([
  ["serviceTier fast", { type: "set", setting: "serviceTier", override: { serviceTier: "priority" } }],
  ["serviceTier priority", { type: "set", setting: "serviceTier", override: { serviceTier: "priority" } }],
  ["serviceTier ultrafast", { type: "set", setting: "serviceTier", override: { serviceTier: "ultrafast" } }],
  ["verbosity low", { type: "set", setting: "verbosity", override: { verbosity: "low" } }],
  ["reasoningSummary null", { type: "set", setting: "reasoningSummary", override: { reasoningSummary: null } }],
  ["allowUnsupported true", { type: "set", setting: "allowUnsupported", override: { allowUnsupported: true } }],
  ["undo", { type: "undo", setting: undefined }],
  ["undo verbosity", { type: "undo", setting: "verbosity" }],
  ["unset verbosity", { type: "unset", setting: "verbosity" }],
  ["save", { type: "save", destination: undefined }],
  ["save project", { type: "save", destination: "project" }],
  ["save global", { type: "save", destination: "global" }],
])("parses %s", (input, expected) => {
  // Act / Assert
  expect(parseCommand(input)).toEqual(expected);
});

it.each([
  "help",
  "reset",
  "reset verbosity",
  "unset",
  "unset other",
  "unset verbosity extra",
  "unknown",
  "status project",
  "save other",
  "undo other",
  "verbosity",
  "webSearch yes",
  "save project extra",
  "__proto__ true",
])("rejects invalid command %s", (input) => {
  // Act / Assert
  expect(() => parseCommand(input)).toThrow();
});

it.each([
  ["serviceTier ", ["serviceTier default", "serviceTier priority", "serviceTier ultrafast"]],
  ["serviceTier p", ["serviceTier priority"]],
  ["serviceTier u", ["serviceTier ultrafast"]],
  ["ver", ["verbosity"]],
  ["verbosity ", ["verbosity low", "verbosity medium", "verbosity high", "verbosity null"]],
  ["verbosity n", ["verbosity null"]],
  ["reasoningSummary n", ["reasoningSummary none", "reasoningSummary null"]],
  ["save ", ["save project", "save global", "save --scope"]],
  ["undo web", ["undo webSearch"]],
  ["unset web", ["unset webSearch"]],
  ["unset verbosity ", ["unset verbosity --scope"]],
  ["unset --scope model ver", ["unset --scope model verbosity"]],
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
    "undo",
    "unset",
    "save",
  ]);
});

it.each([
  [
    "verbosity low --scope model",
    { type: "set", setting: "verbosity", override: { verbosity: "low" }, scope: "model" },
  ],
  [
    "verbosity --scope provider low",
    { type: "set", setting: "verbosity", override: { verbosity: "low" }, scope: "provider" },
  ],
  ["undo verbosity --scope all", { type: "undo", setting: "verbosity", scope: "all" }],
  ["unset verbosity --scope model", { type: "unset", setting: "verbosity", scope: "model" }],
  ["unset --scope all verbosity", { type: "unset", setting: "verbosity", scope: "all" }],
  ["undo --all-scopes", { type: "undo", setting: undefined, allScopes: true }],
  ["save project --scope provider+model", { type: "save", destination: "project", scope: "provider+model" }],
  ["save --scope api global", { type: "save", destination: "global", scope: "api" }],
])("parses scoped command %s", (input, expected) => {
  // Act / Assert
  expect(parseCommand(input)).toEqual(expected);
});

it.each([
  "status --scope all",
  "save --all-scopes",
  "unset --all-scopes",
  "unset verbosity --all-scopes",
  "unset verbosity --scope",
  "unset verbosity --scope all --scope model",
  "verbosity low --all-scopes",
  "undo verbosity --all-scopes",
  "undo --scope all --all-scopes",
  "undo --all-scopes --all-scopes",
  "save --scope model --scope api",
  "save --scope",
  "save --scope endpoint",
  "save --unknown",
])("rejects conflicting or incomplete options: %s", (input) => {
  // Act / Assert
  expect(() => parseCommand(input)).toThrow();
});

it.each([
  ["verbosity low --", ["verbosity low --scope"]],
  ["verbosity --scope model", ["verbosity --scope model", "verbosity --scope model+api"]],
  [
    "save project --scope provider",
    [
      "save project --scope provider",
      "save project --scope provider+api",
      "save project --scope provider+model",
      "save project --scope provider+model+api",
    ],
  ],
  ["undo --all", ["undo --all-scopes"]],
  ["unset --", ["unset --scope"]],
  ["unset --scope mod", ["unset --scope model", "unset --scope model+api"]],
  [
    "verbosity --scope model ",
    [
      "verbosity --scope model low",
      "verbosity --scope model medium",
      "verbosity --scope model high",
      "verbosity --scope model null",
    ],
  ],
])("completes scoped arguments %j", (prefix, expected) => {
  // Act / Assert
  expect(completeArguments(prefix)?.map((item) => item.value)).toEqual(expected);
});

it.each(["save --scope model --", "undo --all-scopes ", "status --", "save --scope --scope "])(
  "does not complete conflicting options %j",
  (prefix) => {
    // Act / Assert
    expect(completeArguments(prefix)).toBeNull();
  },
);
