import { expect, it } from "vitest";
import {
  completeSave,
  prepareSave,
  setCommand,
  undoCommand,
  unsetCommand,
  unsetTarget,
  type Changes,
} from "#src/config/changes";
import { explicitScope, scopeNames, scopeSize } from "#src/config/scopes";
import { layers, model } from "#test/support";

it.each([false, true])("walks scopes by specificity and removes project before global with saves: %s", (saveEach) => {
  // Arrange
  const scopes = scopeNames.map((scope) => explicitScope(scope, model)).toReversed();
  const configuration = {
    verbosity: "high" as const,
    overrides: scopes
      .filter((match) => Object.keys(match).length > 0)
      .map((match) => ({
        match,
        settings: { verbosity: "low" as const, webSearch: true },
      })),
  };
  const input = layers({ global: structuredClone(configuration), project: configuration });
  const changes: Changes = { pending: [], receipts: [] };
  const before = structuredClone(input);

  // Act / Assert
  const targets = [3, 2, 1, 0].flatMap((size) =>
    (["project", "global"] as const).flatMap((destination) =>
      scopes.filter((match) => scopeSize(match) === size).map((match) => ({ match, destination })),
    ),
  );
  for (const { match, destination } of targets) {
    expect(unsetTarget(input, changes, model, "verbosity")).toEqual({ match, destination });
    unsetCommand(input, changes, match, "verbosity", destination);
    if (saveEach) {
      completeSave(changes, prepareSave(changes));
    }
  }
  expect(unsetTarget(input, changes, model, "verbosity")).toBeUndefined();
  expect(changes.pending).toHaveLength(saveEach ? 0 : scopes.length * 2);
  expect(input).toEqual(before);
  expect(unsetTarget(input, changes, model, "webSearch")).toEqual({ match: scopes[0], destination: "project" });
});

it("skips more specific scopes without the setting and nonmatching scopes", () => {
  // Arrange
  const match = { provider: model.provider };
  const input = layers({
    global: {
      overrides: [
        { match: { provider: model.provider, model: model.id }, settings: { webSearch: true } },
        { match: { provider: model.provider, model: "other" }, settings: { verbosity: "low" } },
        { match, settings: { verbosity: "high" } },
      ],
    },
  });
  const changes: Changes = { pending: [], receipts: [] };

  // Act / Assert
  expect(unsetTarget(input, changes, model, "verbosity")).toEqual({ match, destination: "global" });
  expect(changes.pending).toEqual([]);
});

it("uses file source priority to break equal specificity ties, including pending sets", () => {
  // Arrange
  const input = layers({
    global: { overrides: [{ match: { model: model.id }, settings: { verbosity: "low" } }] },
    project: { overrides: [{ match: { provider: model.provider }, settings: { verbosity: "high" } }] },
  });
  const changes: Changes = { pending: [], receipts: [] };
  setCommand(input, changes, { api: model.api }, { verbosity: null }, "global");

  // Act / Assert
  for (const target of [
    { match: { provider: model.provider }, destination: "project" as const },
    { match: { model: model.id }, destination: "global" as const },
    { match: { api: model.api }, destination: "global" as const },
  ]) {
    expect(unsetTarget(input, changes, model, "verbosity")).toEqual(target);
    unsetCommand(input, changes, target.match, "verbosity", target.destination);
  }
  expect(unsetTarget(input, changes, model, "verbosity")).toBeUndefined();
});

it("walks both sources at an explicit scope without falling through to another scope", () => {
  // Arrange
  const match = { model: model.id };
  const input = layers({
    global: { verbosity: "high", overrides: [{ match, settings: { verbosity: "low" } }] },
    project: { overrides: [{ match, settings: { verbosity: "medium" } }] },
  });
  const changes: Changes = { pending: [], receipts: [] };

  // Act / Assert
  for (const destination of ["project", "global"] as const) {
    expect(unsetTarget(input, changes, model, "verbosity", "model")).toEqual({ match, destination });
    unsetCommand(input, changes, match, "verbosity", destination);
  }
  expect(unsetTarget(input, changes, model, "verbosity", "provider")).toBeUndefined();
  expect(unsetTarget(input, changes, model, "verbosity", "model")).toBeUndefined();
  expect(unsetTarget(input, changes, model, "verbosity", "all")).toEqual({ match: {}, destination: "global" });
  expect(unsetTarget(input, changes, model, "verbosity")).toEqual({ match: {}, destination: "global" });
});

it("ignores environment values and defaults rather than synthesizing removals", () => {
  // Arrange
  const input = layers({ environment: { verbosity: "low", webSearch: true } });
  const changes: Changes = { pending: [], receipts: [] };

  // Act / Assert
  expect(unsetTarget(input, changes, model, "verbosity")).toBeUndefined();
  expect(unsetTarget(input, changes, model, "webSearch", "all")).toBeUndefined();
  expect(unsetTarget(input, changes, model, "enabled")).toBeUndefined();
  expect(changes.pending).toEqual([]);
});

it("recognizes explicit null and false values as removable settings", () => {
  // Arrange
  const input = layers({ global: { verbosity: null, enabled: false, webSearch: false } });
  const changes: Changes = { pending: [], receipts: [] };

  // Act / Assert
  for (const setting of ["verbosity", "enabled", "webSearch"] as const) {
    expect(unsetTarget(input, changes, model, setting)).toEqual({ match: {}, destination: "global" });
  }
});

it("makes a source eligible again after undo or replacing its removal with a set", () => {
  // Arrange
  const match = { model: model.id };
  const input = layers({ global: { overrides: [{ match, settings: { verbosity: "high" } }] } });
  const changes: Changes = { pending: [], receipts: [] };
  unsetCommand(input, changes, match, "verbosity", "global");

  // Act / Assert
  expect(unsetTarget(input, changes, model, "verbosity")).toBeUndefined();
  undoCommand(input, changes, match, "verbosity");
  expect(unsetTarget(input, changes, model, "verbosity")).toEqual({ match, destination: "global" });
  unsetCommand(input, changes, match, "verbosity", "global");
  setCommand(input, changes, match, { verbosity: "low" }, "global");
  expect(unsetTarget(input, changes, model, "verbosity")).toEqual({ match, destination: "global" });
});

it("accounts for source-filtered saves without hiding the other file or changing loaded settings", () => {
  // Arrange
  const match = { model: model.id };
  const input = layers({
    global: { overrides: [{ match, settings: { verbosity: "low" } }] },
    project: { overrides: [{ match, settings: { verbosity: "high" } }] },
  });
  const before = structuredClone(input);
  const changes: Changes = { pending: [], receipts: [] };
  unsetCommand(input, changes, match, "verbosity", "project");
  completeSave(changes, prepareSave(changes, { source: "project" }));

  // Act / Assert
  expect(unsetTarget(input, changes, model, "verbosity")).toEqual({ match, destination: "global" });
  unsetCommand(input, changes, match, "verbosity", "global");
  completeSave(changes, prepareSave(changes));
  expect(unsetTarget(input, changes, model, "verbosity")).toBeUndefined();
  expect(input).toEqual(before);
});

it("can remove saved-only values at their recorded source and scope after undo", () => {
  // Arrange
  const input = layers();
  const changes: Changes = { pending: [], receipts: [] };
  const match = { provider: model.provider };
  setCommand(input, changes, match, { verbosity: "low" }, "project");
  completeSave(changes, prepareSave(changes));
  undoCommand(input, changes);

  // Act / Assert
  expect(unsetTarget(input, changes, model, "verbosity")).toEqual({ match, destination: "project" });
  unsetCommand(input, changes, match, "verbosity", "project");
  completeSave(changes, prepareSave(changes));
  expect(unsetTarget(input, changes, model, "verbosity")).toBeUndefined();
});

it("does not reconsider saved runtime command values after their file value was removed", () => {
  // Arrange
  const input = layers();
  const changes: Changes = { pending: [], receipts: [] };
  setCommand(input, changes, {}, { verbosity: "low" }, "global");
  completeSave(changes, prepareSave(changes));
  unsetCommand(input, changes, {}, "verbosity", "global");
  completeSave(changes, prepareSave(changes));

  // Act / Assert
  expect(unsetTarget(input, changes, model, "verbosity")).toBeUndefined();
});

it("excludes project values and edits if trust is revoked", () => {
  // Arrange
  const input = layers({ global: { verbosity: "low" }, project: { verbosity: "high" } });
  const changes: Changes = { pending: [], receipts: [] };
  setCommand(input, changes, { model: model.id }, { verbosity: "medium" }, "project");

  // Act / Assert
  expect(unsetTarget(input, changes, model, "verbosity", undefined, false)).toEqual({
    match: {},
    destination: "global",
  });
  expect(unsetTarget(input, changes, model, "verbosity", "model", false)).toBeUndefined();
});

it("requires --scope all without a selected model and reports missing explicit settings as absent", () => {
  // Arrange
  const input = layers({ global: { verbosity: "high" } });
  const changes: Changes = { pending: [], receipts: [] };

  // Act / Assert
  expect(() => unsetTarget(input, changes, undefined, "verbosity")).toThrow("No model selected; use --scope all.");
  expect(() => unsetTarget(input, changes, undefined, "verbosity", "model")).toThrow("--scope all");
  expect(unsetTarget(input, changes, undefined, "verbosity", "all")).toEqual({ match: {}, destination: "global" });
  expect(unsetTarget(input, changes, undefined, "webSearch", "all")).toBeUndefined();
});
