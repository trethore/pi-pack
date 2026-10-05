import { expect, it } from "vitest";
import { Setting } from "#src/config/settings";
import { Verbosity, Destination } from "#src/constants";
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
    verbosity: Verbosity.HIGH,
    overrides: scopes
      .filter((match) => Object.keys(match).length > 0)
      .map((match) => ({
        match,
        settings: { verbosity: Verbosity.LOW, webSearch: true },
      })),
  };
  const input = layers({ global: structuredClone(configuration), project: configuration });
  const changes: Changes = { pending: [], receipts: [] };
  const before = structuredClone(input);

  // Act / Assert
  const targets = [3, 2, 1, 0].flatMap((size) =>
    ([Destination.PROJECT, Destination.GLOBAL] as const).flatMap((destination) =>
      scopes.filter((match) => scopeSize(match) === size).map((match) => ({ match, destination })),
    ),
  );
  for (const { match, destination } of targets) {
    expect(unsetTarget(input, changes, model, Setting.VERBOSITY)).toEqual({ match, destination });
    unsetCommand(input, changes, match, Setting.VERBOSITY, destination);
    if (saveEach) {
      completeSave(changes, prepareSave(changes));
    }
  }
  expect(unsetTarget(input, changes, model, Setting.VERBOSITY)).toBeUndefined();
  expect(changes.pending).toHaveLength(saveEach ? 0 : scopes.length * 2);
  expect(input).toEqual(before);
  expect(unsetTarget(input, changes, model, Setting.WEB_SEARCH)).toEqual({
    match: scopes[0],
    destination: Destination.PROJECT,
  });
});

it("skips more specific scopes without the setting and nonmatching scopes", () => {
  // Arrange
  const match = { provider: model.provider };
  const input = layers({
    global: {
      overrides: [
        { match: { provider: model.provider, model: model.id }, settings: { webSearch: true } },
        { match: { provider: model.provider, model: "other" }, settings: { verbosity: Verbosity.LOW } },
        { match, settings: { verbosity: Verbosity.HIGH } },
      ],
    },
  });
  const changes: Changes = { pending: [], receipts: [] };

  // Act / Assert
  expect(unsetTarget(input, changes, model, Setting.VERBOSITY)).toEqual({ match, destination: Destination.GLOBAL });
  expect(changes.pending).toEqual([]);
});

it("uses file source priority to break equal specificity ties, including pending sets", () => {
  // Arrange
  const input = layers({
    global: { overrides: [{ match: { model: model.id }, settings: { verbosity: Verbosity.LOW } }] },
    project: { overrides: [{ match: { provider: model.provider }, settings: { verbosity: Verbosity.HIGH } }] },
  });
  const changes: Changes = { pending: [], receipts: [] };
  setCommand(input, changes, { api: model.api }, { verbosity: null }, Destination.GLOBAL);

  // Act / Assert
  for (const target of [
    { match: { provider: model.provider }, destination: Destination.PROJECT },
    { match: { model: model.id }, destination: Destination.GLOBAL },
    { match: { api: model.api }, destination: Destination.GLOBAL },
  ]) {
    expect(unsetTarget(input, changes, model, Setting.VERBOSITY)).toEqual(target);
    unsetCommand(input, changes, target.match, Setting.VERBOSITY, target.destination);
  }
  expect(unsetTarget(input, changes, model, Setting.VERBOSITY)).toBeUndefined();
});

it("walks both sources at an explicit scope without falling through to another scope", () => {
  // Arrange
  const match = { model: model.id };
  const input = layers({
    global: { verbosity: Verbosity.HIGH, overrides: [{ match, settings: { verbosity: Verbosity.LOW } }] },
    project: { overrides: [{ match, settings: { verbosity: Verbosity.MEDIUM } }] },
  });
  const changes: Changes = { pending: [], receipts: [] };

  // Act / Assert
  for (const destination of [Destination.PROJECT, Destination.GLOBAL] as const) {
    expect(unsetTarget(input, changes, model, Setting.VERBOSITY, "model")).toEqual({ match, destination });
    unsetCommand(input, changes, match, Setting.VERBOSITY, destination);
  }
  expect(unsetTarget(input, changes, model, Setting.VERBOSITY, "provider")).toBeUndefined();
  expect(unsetTarget(input, changes, model, Setting.VERBOSITY, "model")).toBeUndefined();
  expect(unsetTarget(input, changes, model, Setting.VERBOSITY, "all")).toEqual({
    match: {},
    destination: Destination.GLOBAL,
  });
  expect(unsetTarget(input, changes, model, Setting.VERBOSITY)).toEqual({ match: {}, destination: Destination.GLOBAL });
});

it("ignores environment values and defaults rather than synthesizing removals", () => {
  // Arrange
  const input = layers({ environment: { verbosity: Verbosity.LOW, webSearch: true } });
  const changes: Changes = { pending: [], receipts: [] };

  // Act / Assert
  expect(unsetTarget(input, changes, model, Setting.VERBOSITY)).toBeUndefined();
  expect(unsetTarget(input, changes, model, Setting.WEB_SEARCH, "all")).toBeUndefined();
  expect(unsetTarget(input, changes, model, Setting.ENABLED)).toBeUndefined();
  expect(changes.pending).toEqual([]);
});

it("recognizes explicit null and false values as removable settings", () => {
  // Arrange
  const input = layers({ global: { verbosity: null, enabled: false, webSearch: false } });
  const changes: Changes = { pending: [], receipts: [] };

  // Act / Assert
  for (const setting of [Setting.VERBOSITY, Setting.ENABLED, Setting.WEB_SEARCH] as const) {
    expect(unsetTarget(input, changes, model, setting)).toEqual({ match: {}, destination: Destination.GLOBAL });
  }
});

it("makes a source eligible again after undo or replacing its removal with a set", () => {
  // Arrange
  const match = { model: model.id };
  const input = layers({ global: { overrides: [{ match, settings: { verbosity: Verbosity.HIGH } }] } });
  const changes: Changes = { pending: [], receipts: [] };
  unsetCommand(input, changes, match, Setting.VERBOSITY, Destination.GLOBAL);

  // Act / Assert
  expect(unsetTarget(input, changes, model, Setting.VERBOSITY)).toBeUndefined();
  undoCommand(input, changes, match, Setting.VERBOSITY);
  expect(unsetTarget(input, changes, model, Setting.VERBOSITY)).toEqual({ match, destination: Destination.GLOBAL });
  unsetCommand(input, changes, match, Setting.VERBOSITY, Destination.GLOBAL);
  setCommand(input, changes, match, { verbosity: Verbosity.LOW }, Destination.GLOBAL);
  expect(unsetTarget(input, changes, model, Setting.VERBOSITY)).toEqual({ match, destination: Destination.GLOBAL });
});

it("accounts for source-filtered saves without hiding the other file or changing loaded settings", () => {
  // Arrange
  const match = { model: model.id };
  const input = layers({
    global: { overrides: [{ match, settings: { verbosity: Verbosity.LOW } }] },
    project: { overrides: [{ match, settings: { verbosity: Verbosity.HIGH } }] },
  });
  const before = structuredClone(input);
  const changes: Changes = { pending: [], receipts: [] };
  unsetCommand(input, changes, match, Setting.VERBOSITY, Destination.PROJECT);
  completeSave(changes, prepareSave(changes, { source: Destination.PROJECT }));

  // Act / Assert
  expect(unsetTarget(input, changes, model, Setting.VERBOSITY)).toEqual({ match, destination: Destination.GLOBAL });
  unsetCommand(input, changes, match, Setting.VERBOSITY, Destination.GLOBAL);
  completeSave(changes, prepareSave(changes));
  expect(unsetTarget(input, changes, model, Setting.VERBOSITY)).toBeUndefined();
  expect(input).toEqual(before);
});

it("can remove saved-only values at their recorded source and scope after undo", () => {
  // Arrange
  const input = layers();
  const changes: Changes = { pending: [], receipts: [] };
  const match = { provider: model.provider };
  setCommand(input, changes, match, { verbosity: Verbosity.LOW }, Destination.PROJECT);
  completeSave(changes, prepareSave(changes));
  undoCommand(input, changes);

  // Act / Assert
  expect(unsetTarget(input, changes, model, Setting.VERBOSITY)).toEqual({ match, destination: Destination.PROJECT });
  unsetCommand(input, changes, match, Setting.VERBOSITY, Destination.PROJECT);
  completeSave(changes, prepareSave(changes));
  expect(unsetTarget(input, changes, model, Setting.VERBOSITY)).toBeUndefined();
});

it("does not reconsider saved runtime command values after their file value was removed", () => {
  // Arrange
  const input = layers();
  const changes: Changes = { pending: [], receipts: [] };
  setCommand(input, changes, {}, { verbosity: Verbosity.LOW }, Destination.GLOBAL);
  completeSave(changes, prepareSave(changes));
  unsetCommand(input, changes, {}, Setting.VERBOSITY, Destination.GLOBAL);
  completeSave(changes, prepareSave(changes));

  // Act / Assert
  expect(unsetTarget(input, changes, model, Setting.VERBOSITY)).toBeUndefined();
});

it("excludes project values and edits if trust is revoked", () => {
  // Arrange
  const input = layers({ global: { verbosity: Verbosity.LOW }, project: { verbosity: Verbosity.HIGH } });
  const changes: Changes = { pending: [], receipts: [] };
  setCommand(input, changes, { model: model.id }, { verbosity: Verbosity.MEDIUM }, Destination.PROJECT);

  // Act / Assert
  expect(unsetTarget(input, changes, model, Setting.VERBOSITY, undefined, false)).toEqual({
    match: {},
    destination: Destination.GLOBAL,
  });
  expect(unsetTarget(input, changes, model, Setting.VERBOSITY, "model", false)).toBeUndefined();
});

it("requires --scope all without a selected model and reports missing explicit settings as absent", () => {
  // Arrange
  const input = layers({ global: { verbosity: Verbosity.HIGH } });
  const changes: Changes = { pending: [], receipts: [] };

  // Act / Assert
  expect(() => unsetTarget(input, changes, undefined, Setting.VERBOSITY)).toThrow(
    "No model selected; use --scope all.",
  );
  expect(() => unsetTarget(input, changes, undefined, Setting.VERBOSITY, "model")).toThrow("--scope all");
  expect(unsetTarget(input, changes, undefined, Setting.VERBOSITY, "all")).toEqual({
    match: {},
    destination: Destination.GLOBAL,
  });
  expect(unsetTarget(input, changes, undefined, Setting.WEB_SEARCH, "all")).toBeUndefined();
});
