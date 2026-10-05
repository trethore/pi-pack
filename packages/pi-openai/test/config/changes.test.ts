import { expect, it } from "vitest";
import { completeSave, prepareSave, undoCommand, unsetCommand, setCommand, type Changes } from "#src/config/changes";
import { automaticScope, commandScope } from "#src/config/scopes";
import { resolveSettings } from "#src/config/settings";
import { layers, model } from "#test/support";

function changes(): Changes {
  return { pending: [], receipts: [] };
}

it("captures pending keys and scopes without copying inherited or environment settings", () => {
  // Arrange
  const input = layers({ global: { webSearch: true }, environment: { verbosity: "high" } });
  const edits = changes();
  const match = { model: model.id };

  // Act
  setCommand(input, edits, match, { verbosity: "low" });
  match.model = "changed-later";
  const batch = prepareSave(input, edits);

  // Assert
  expect(batch.patches).toEqual([{ match: { model: model.id }, settings: { verbosity: "low" } }]);
  expect(resolveSettings(input, model).values).toMatchObject({ verbosity: "low", webSearch: true });
  expect(resolveSettings(input, { ...model, id: "other" }).values.verbosity).toBe("high");
});

it("keeps scopes and settings active after a retargeted save", () => {
  // Arrange
  const input = layers({ global: { verbosity: "medium" } });
  const edits = changes();
  setCommand(input, edits, { model: model.id }, { verbosity: "low" });
  const before = structuredClone(input);
  const batch = prepareSave(input, edits, { provider: model.provider });

  // Act
  completeSave(edits, batch, "project");

  // Assert
  expect(input).toEqual(before);
  expect(edits.pending).toEqual([]);
  expect(edits.receipts).toEqual([
    {
      destination: "project",
      match: { provider: model.provider },
      settings: { verbosity: "low" },
    },
  ]);
  expect(automaticScope(input, model)).toEqual({ model: model.id });
  expect(prepareSave(input, edits).patches).toEqual([]);
});

it("merges disjoint keys and identical values when retargeting", () => {
  // Arrange
  const input = layers();
  const edits = changes();
  setCommand(input, edits, { model: model.id }, { verbosity: "low" });
  setCommand(input, edits, { provider: model.provider }, { verbosity: "low", webSearch: true });

  // Act / Assert
  expect(prepareSave(input, edits, {}).patches).toEqual([
    {
      match: {},
      settings: { verbosity: "low", webSearch: true },
    },
  ]);
});

it("rejects conflicting pending values before retargeting", () => {
  // Arrange
  const input = layers();
  const edits = changes();
  setCommand(input, edits, { model: model.id }, { verbosity: "low" });
  setCommand(input, edits, { provider: model.provider }, { verbosity: "high" });

  // Act / Assert
  expect(() => prepareSave(input, edits, {})).toThrow("Conflicting verbosity");
  expect(edits.pending).toHaveLength(2);
  expect(prepareSave(input, edits).patches).toHaveLength(2);
});

it("rejects conflicts with a saved runtime target without copying unrelated target keys", () => {
  // Arrange
  const input = layers();
  const edits = changes();
  setCommand(input, edits, {}, { verbosity: "high", webSearch: true });
  completeSave(edits, prepareSave(input, edits), "global");
  setCommand(input, edits, { model: model.id }, { verbosity: "low" });

  // Act / Assert
  expect(() => prepareSave(input, edits, {})).toThrow("Conflicting verbosity");
  setCommand(input, edits, { model: model.id }, { verbosity: "high" });
  expect(prepareSave(input, edits, {}).patches).toEqual([{ match: {}, settings: { verbosity: "high" } }]);
});

it("undoes only the selected runtime scope and preserves persisted receipts", () => {
  // Arrange
  const input = layers({ global: { verbosity: "medium" } });
  const edits = changes();
  const selector = { model: model.id };
  setCommand(input, edits, selector, { verbosity: "low", webSearch: true });
  completeSave(edits, prepareSave(input, edits), "global");
  setCommand(input, edits, { provider: model.provider }, { reasoningSummary: "auto" });

  // Act / Assert
  undoCommand(input, edits, selector, "verbosity");
  expect(resolveSettings(input, model).values).toMatchObject({ verbosity: "medium", webSearch: true });
  undoCommand(input, edits, selector);
  expect(automaticScope(input, model)).toEqual({ provider: model.provider });
  expect(edits.pending).toHaveLength(1);
  undoCommand(input, edits);
  expect(input.command).toEqual({});
  expect(edits.pending).toEqual([]);
  expect(edits.receipts).toHaveLength(1);
});

it("does not lose edits made while a save is in progress", () => {
  // Arrange
  const input = layers();
  const edits = changes();
  setCommand(input, edits, {}, { verbosity: "low" });
  const batch = prepareSave(input, edits);

  // Act
  setCommand(input, edits, {}, { verbosity: "high" });
  completeSave(edits, batch, "global");

  // Assert
  expect(edits.pending).toEqual([{ match: {}, settings: { verbosity: "high" } }]);
  expect(edits.receipts[0]?.settings).toEqual({ verbosity: "low" });
  expect(input.command.verbosity).toBe("high");
});

it("preserves undo during a save and merges receipts per destination and selector", () => {
  // Arrange
  const input = layers();
  const edits = changes();
  setCommand(input, edits, {}, { verbosity: "low" });
  const batch = prepareSave(input, edits);
  undoCommand(input, edits);

  // Act
  completeSave(edits, batch, "global");
  setCommand(input, edits, {}, { webSearch: true });
  completeSave(edits, prepareSave(input, edits), "global");
  setCommand(input, edits, {}, { verbosity: "high" });
  completeSave(edits, prepareSave(input, edits), "project");

  // Assert
  expect(edits.receipts).toEqual([
    { destination: "global", match: {}, settings: { verbosity: "low", webSearch: true } },
    { destination: "project", match: {}, settings: { verbosity: "high" } },
  ]);
  expect(edits.pending).toEqual([]);
});

it("undoes exact scopes and exposes broader command overrides before loaded values", () => {
  // Arrange
  const input = layers({ environment: { verbosity: "medium" } });
  const edits = changes();
  setCommand(input, edits, {}, { verbosity: "medium" });
  setCommand(input, edits, { provider: model.provider }, { verbosity: "high" });
  setCommand(input, edits, { model: model.id }, { verbosity: "low", webSearch: true });

  // Act / Assert
  undoCommand(input, edits, commandScope(input, model), "verbosity");
  expect(resolveSettings(input, model).values).toMatchObject({ verbosity: "high", webSearch: true });
  expect(edits.pending).toContainEqual({ match: { model: model.id }, settings: { webSearch: true } });
  undoCommand(input, edits, commandScope(input, model, "all"));
  expect(resolveSettings(input, model).values.verbosity).toBe("high");
  expect(edits.pending).toHaveLength(2);
  undoCommand(input, edits, commandScope(input, model, "provider"));
  expect(resolveSettings(input, model).values.verbosity).toBe("medium");
  undoCommand(input, edits);
  expect(input.command).toEqual({});
  expect(edits.pending).toEqual([]);
});

it("does not fall through when the automatic undo target has no command value for the setting", () => {
  // Arrange
  const input = layers({
    global: { overrides: [{ match: { provider: model.provider, model: model.id }, settings: { webSearch: true } }] },
  });
  const edits = changes();
  setCommand(input, edits, { provider: model.provider }, { verbosity: "high" });
  const before = structuredClone(edits);

  // Act
  const target = commandScope(input, model);
  undoCommand(input, edits, target, "verbosity");

  // Assert
  expect(target).toEqual({ provider: model.provider, model: model.id });
  expect(resolveSettings(input, model).values.verbosity).toBe("high");
  expect(edits).toEqual(before);
});

it("stages removal without changing loaded configuration and keeps the scope available for undo", () => {
  // Arrange
  const input = layers({ global: { verbosity: "high" } });
  const edits = changes();
  const match = { model: model.id };
  setCommand(input, edits, match, { verbosity: "low" });

  // Act
  unsetCommand(input, edits, match, "verbosity");
  const target = commandScope(input, model, undefined, edits.pending);

  // Assert
  expect(input.command).toEqual({});
  expect(input.global).toEqual({ verbosity: "high" });
  expect(resolveSettings(input, model).values.verbosity).toBe("high");
  expect(edits.pending).toEqual([{ match, settings: {}, unset: ["verbosity"] }]);
  expect(target).toEqual(match);
  undoCommand(input, edits, target, "verbosity");
  expect(edits.pending).toEqual([]);
});

it("replaces pending sets with removals and removals with sets without losing other edits", () => {
  // Arrange
  const input = layers();
  const edits = changes();
  setCommand(input, edits, {}, { verbosity: null, webSearch: true });

  // Act / Assert
  unsetCommand(input, edits, {}, "verbosity");
  unsetCommand(input, edits, {}, "reasoningSummary");
  unsetCommand(input, edits, {}, "verbosity");
  expect(edits.pending).toEqual([
    { match: {}, settings: { webSearch: true }, unset: ["verbosity", "reasoningSummary"] },
  ]);
  setCommand(input, edits, {}, { verbosity: null });
  expect(edits.pending).toEqual([
    { match: {}, settings: { webSearch: true, verbosity: null }, unset: ["reasoningSummary"] },
  ]);
  undoCommand(input, edits, {}, "webSearch");
  undoCommand(input, edits, {}, "reasoningSummary");
  expect(edits.pending).toEqual([{ match: {}, settings: { verbosity: null } }]);
});

it("merges identical removals and disjoint settings when retargeting", () => {
  // Arrange
  const input = layers();
  const edits = changes();
  unsetCommand(input, edits, { model: model.id }, "verbosity");
  unsetCommand(input, edits, { provider: model.provider }, "verbosity");
  setCommand(input, edits, { api: model.api }, { webSearch: true });

  // Act
  const batch = prepareSave(input, edits, {});

  // Assert
  expect(batch.patches).toEqual([{ match: {}, settings: { webSearch: true }, unset: ["verbosity"] }]);
  expect(edits.pending).toHaveLength(3);
});

it.each([true, false])("rejects conflicting set and removal retargets with removal first: %s", (removalFirst) => {
  // Arrange
  const input = layers();
  const edits = changes();
  const remove = () => unsetCommand(input, edits, { model: model.id }, "verbosity");
  const set = () => setCommand(input, edits, { provider: model.provider }, { verbosity: null });
  if (removalFirst) {
    remove();
    set();
  } else {
    set();
    remove();
  }

  // Act / Assert
  expect(() => prepareSave(input, edits, {})).toThrow("Conflicting verbosity edits");
  expect(edits.pending).toHaveLength(2);
});

it("rejects retargeting removal over an existing saved command value", () => {
  // Arrange
  const input = layers();
  const edits = changes();
  setCommand(input, edits, {}, { verbosity: "high" });
  completeSave(edits, prepareSave(input, edits), "global");
  unsetCommand(input, edits, { model: model.id }, "verbosity");

  // Act / Assert
  expect(() => prepareSave(input, edits, {})).toThrow("Conflicting verbosity edits");
});

it("replaces saved values with removal receipts and keeps receipts separate by destination", () => {
  // Arrange
  const input = layers();
  const edits = changes();
  setCommand(input, edits, {}, { verbosity: "low", webSearch: true });
  completeSave(edits, prepareSave(input, edits), "global");
  unsetCommand(input, edits, {}, "verbosity");

  // Act / Assert
  completeSave(edits, prepareSave(input, edits), "global");
  expect(edits.receipts).toEqual([
    { destination: "global", match: {}, settings: { webSearch: true }, unset: ["verbosity"] },
  ]);
  setCommand(input, edits, {}, { verbosity: null });
  completeSave(edits, prepareSave(input, edits), "project");
  expect(edits.receipts).toContainEqual({ destination: "project", match: {}, settings: { verbosity: null } });
  setCommand(input, edits, {}, { verbosity: "high" });
  completeSave(edits, prepareSave(input, edits), "global");
  expect(edits.receipts).toContainEqual({
    destination: "global",
    match: {},
    settings: { webSearch: true, verbosity: "high" },
  });
});

it.each(["set", "unset", "undo"])("keeps %s during a removal save", (action) => {
  // Arrange
  const input = layers();
  const edits = changes();
  unsetCommand(input, edits, {}, "verbosity");
  const batch = prepareSave(input, edits);

  // Act
  if (action === "set") {
    setCommand(input, edits, {}, { verbosity: "low" });
  } else if (action === "unset") {
    unsetCommand(input, edits, {}, "webSearch");
  } else {
    undoCommand(input, edits);
  }
  const pending = structuredClone(edits.pending);
  completeSave(edits, batch, "global");

  // Assert
  expect(edits.pending).toEqual(pending);
  expect(edits.receipts).toEqual([{ destination: "global", match: {}, settings: {}, unset: ["verbosity"] }]);
});
