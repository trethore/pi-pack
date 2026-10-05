import { expect, it } from "vitest";
import { parseSource, patchSource } from "#src/config/document";

it.each([
  ['{\n  "verbosity": "low",\n  "enabled": true\n}\n', '{\n  "enabled": true\n}\n'],
  ['{\n  "enabled": true,\n  "verbosity": "low"\n}\n', '{\n  "enabled": true\n}\n'],
  ['{\n  "enabled": true,\n  "verbosity": "low",\n}\n', '{\n  "enabled": true,\n}\n'],
  ['{\n  "verbosity": "low"\n}\n', "{\n}\n"],
  [
    '{\n\n  "verbosity": "low",\n  // Keep this.\n  "enabled": true\n\n}\n',
    '{\n\n  // Keep this.\n  "enabled": true\n\n}\n',
  ],
  ['{\n  "verbosity": "low", // Keep this.\n  "enabled": true\n}\n', '{\n   // Keep this.\n  "enabled": true\n}\n'],
  ['{\n  "enabled": true, // Keep this.\n  "verbosity": "low"\n}\n', '{\n  "enabled": true // Keep this.\n}\n'],
])("removes property lines without changing unrelated whitespace or comments: %s", (source, expected) => {
  // Arrange
  const configuration = parseSource(source, "global");

  // Act
  const saved = patchSource(source, configuration, [{ match: {}, settings: {}, unset: ["verbosity"] }]);

  // Assert
  expect(saved).toBe(expected);
  expect(parseSource(saved, "global")).not.toHaveProperty("verbosity");
});

it.each(["\n", "\r\n"])("removes nested setting lines using %j line endings", (eol) => {
  // Arrange
  const match = { model: "test" };
  const source = JSON.stringify(
    { overrides: [{ match, settings: { verbosity: "low", webSearch: true } }] },
    null,
    2,
  ).replaceAll("\n", eol);
  const configuration = parseSource(source, "global");

  // Act
  const saved = patchSource(source, configuration, [{ match, settings: {}, unset: ["verbosity"] }]);

  // Assert
  expect(saved).toBe(source.replace(`        "verbosity": "low",${eol}`, ""));
});

it.each(["\n", "\r\n"])("prunes whole override blocks without leaving blank lines using %j", (eol) => {
  // Arrange
  const first = { match: { model: "first" }, settings: { verbosity: "low" } };
  const second = { match: { model: "second" }, settings: { verbosity: "high" } };
  const source = JSON.stringify({ enabled: true, overrides: [first, second] }, null, 2).replaceAll("\n", eol);
  const configuration = parseSource(source, "global");

  // Act
  const saved = patchSource(source, configuration, [{ match: first.match, settings: {}, unset: ["verbosity"] }]);
  const pruned = patchSource(saved, parseSource(saved, "global"), [
    { match: second.match, settings: {}, unset: ["verbosity"] },
  ]);

  // Assert
  expect(saved).toBe(JSON.stringify({ enabled: true, overrides: [second] }, null, 2).replaceAll("\n", eol));
  expect(pruned).toBe(JSON.stringify({ enabled: true }, null, 2).replaceAll("\n", eol));
});
