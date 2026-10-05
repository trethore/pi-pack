import { expect, it } from "vitest";
import {
  completeSave,
  prepareSave,
  setCommand,
  undoCommand,
  unsetCommand,
  unsetScope,
  type Changes,
} from "#src/config/changes";
import { explicitScope, scopeNames } from "#src/config/scopes";
import { layers, model } from "#test/support";

it("walks matching scopes from most specific to All models without changing loaded configuration", () => {
  // Arrange
  const scopes = scopeNames.map((scope) => explicitScope(scope, model)).toReversed();
  const input = layers({
    global: {
      verbosity: "high",
      overrides: scopes
        .filter((match) => Object.keys(match).length > 0)
        .map((match) => ({
          match,
          settings: { verbosity: "low", webSearch: true },
        })),
    },
  });
  const changes: Changes = { pending: [], receipts: [] };
  const before = structuredClone(input);

  // Act / Assert
  for (const match of scopes) {
    expect(unsetScope(input, changes, model, "verbosity")).toEqual(match);
    unsetCommand(input, changes, match, "verbosity");
  }
  expect(unsetScope(input, changes, model, "verbosity")).toBeUndefined();
  expect(changes.pending).toHaveLength(scopes.length);
  expect(input).toEqual(before);
  expect(unsetScope(input, changes, model, "webSearch")).toEqual(scopes[0]);
});

it("skips more specific scopes that do not define the requested setting and nonmatching scopes", () => {
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

  // Act
  const target = unsetScope(input, changes, model, "verbosity");

  // Assert
  expect(target).toEqual(match);
  expect(changes.pending).toEqual([]);
});

it("uses source priority to break equal specificity ties only among scopes defining the setting", () => {
  // Arrange
  const input = layers({
    global: { overrides: [{ match: { model: model.id }, settings: { verbosity: "low" } }] },
    project: { overrides: [{ match: { provider: model.provider }, settings: { verbosity: "high" } }] },
  });
  const changes: Changes = { pending: [], receipts: [] };
  setCommand(input, changes, { api: model.api }, { verbosity: null });

  // Act / Assert
  for (const match of [{ api: model.api }, { provider: model.provider }, { model: model.id }]) {
    expect(unsetScope(input, changes, model, "verbosity")).toEqual(match);
    unsetCommand(input, changes, match, "verbosity");
  }
  expect(unsetScope(input, changes, model, "verbosity")).toBeUndefined();
});

it("does not fall through an explicit absent or already pending scope", () => {
  // Arrange
  const input = layers({
    global: {
      verbosity: "high",
      overrides: [{ match: { model: model.id }, settings: { verbosity: "low" } }],
    },
  });
  const changes: Changes = { pending: [], receipts: [] };
  unsetCommand(input, changes, { model: model.id }, "verbosity");
  const before = structuredClone(changes);

  // Act / Assert
  expect(unsetScope(input, changes, model, "verbosity", "provider")).toBeUndefined();
  expect(unsetScope(input, changes, model, "verbosity", "model")).toBeUndefined();
  expect(unsetScope(input, changes, model, "verbosity", "all")).toEqual({});
  expect(unsetScope(input, changes, model, "verbosity")).toEqual({});
  expect(changes).toEqual(before);
});

it("ignores environment values and defaults rather than synthesizing a removal", () => {
  // Arrange
  const input = layers({ environment: { verbosity: "low", webSearch: true } });
  const changes: Changes = { pending: [], receipts: [] };

  // Act / Assert
  expect(unsetScope(input, changes, model, "verbosity")).toBeUndefined();
  expect(unsetScope(input, changes, model, "webSearch", "all")).toBeUndefined();
  expect(unsetScope(input, changes, model, "enabled")).toBeUndefined();
  expect(changes.pending).toEqual([]);
});

it("recognizes explicit null and false values as removable settings", () => {
  // Arrange
  const input = layers({ global: { verbosity: null, enabled: false, webSearch: false } });
  const changes: Changes = { pending: [], receipts: [] };

  // Act / Assert
  for (const setting of ["verbosity", "enabled", "webSearch"] as const) {
    expect(unsetScope(input, changes, model, setting)).toEqual({});
  }
});

it("makes a scope available again when its pending removal is undone or replaced with a set", () => {
  // Arrange
  const match = { model: model.id };
  const input = layers({ global: { overrides: [{ match, settings: { verbosity: "high" } }] } });
  const changes: Changes = { pending: [], receipts: [] };
  unsetCommand(input, changes, match, "verbosity");

  // Act / Assert
  expect(unsetScope(input, changes, model, "verbosity")).toBeUndefined();
  undoCommand(input, changes, match, "verbosity");
  expect(unsetScope(input, changes, model, "verbosity")).toEqual(match);
  unsetCommand(input, changes, match, "verbosity");
  setCommand(input, changes, match, { verbosity: "low" });
  expect(unsetScope(input, changes, model, "verbosity")).toEqual(match);
});

it("skips saved removals without changing the loaded layers", () => {
  // Arrange
  const match = { model: model.id };
  const input = layers({
    global: { verbosity: "high", overrides: [{ match, settings: { verbosity: "low" } }] },
  });
  const changes: Changes = { pending: [], receipts: [] };
  unsetCommand(input, changes, match, "verbosity");
  completeSave(changes, prepareSave(input, changes), "global");
  const before = structuredClone({ input, changes });

  // Act / Assert
  expect(unsetScope(input, changes, model, "verbosity")).toEqual({});
  expect(unsetScope(input, changes, model, "verbosity", "model")).toBeUndefined();
  expect({ input, changes }).toEqual(before);
});

it("does not hide a value in another file when one destination has a saved removal", () => {
  // Arrange
  const match = { model: model.id };
  const input = layers({
    global: { overrides: [{ match, settings: { verbosity: "low" } }] },
    project: { overrides: [{ match, settings: { verbosity: "high" } }] },
  });
  const changes: Changes = { pending: [], receipts: [] };
  unsetCommand(input, changes, match, "verbosity");
  const batch = prepareSave(input, changes);
  completeSave(changes, batch, "project");

  // Act / Assert
  expect(unsetScope(input, changes, model, "verbosity")).toEqual(match);
  completeSave(changes, batch, "global");
  expect(unsetScope(input, changes, model, "verbosity")).toBeUndefined();
});

it("can remove saved-only values at their actual persisted scope", () => {
  // Arrange
  const input = layers();
  const changes: Changes = { pending: [], receipts: [] };
  const match = { provider: model.provider };
  setCommand(input, changes, { model: model.id }, { verbosity: "low" });
  completeSave(changes, prepareSave(input, changes, match), "global");
  undoCommand(input, changes);

  // Act / Assert
  expect(unsetScope(input, changes, model, "verbosity")).toEqual(match);
  unsetCommand(input, changes, match, "verbosity");
  completeSave(changes, prepareSave(input, changes), "global");
  expect(unsetScope(input, changes, model, "verbosity")).toBeUndefined();
});

it("requires --scope all without a selected model and reports missing explicit settings as absent", () => {
  // Arrange
  const input = layers({ global: { verbosity: "high" } });
  const changes: Changes = { pending: [], receipts: [] };

  // Act / Assert
  expect(() => unsetScope(input, changes, undefined, "verbosity")).toThrow("No model selected; use --scope all.");
  expect(() => unsetScope(input, changes, undefined, "verbosity", "model")).toThrow("--scope all");
  expect(unsetScope(input, changes, undefined, "verbosity", "all")).toEqual({});
  expect(unsetScope(input, changes, undefined, "webSearch", "all")).toBeUndefined();
});
