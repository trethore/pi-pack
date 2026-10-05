import { expect, it } from "vitest";
import { completeSave, prepareSave, resetCommand, setCommand, type Changes } from "#src/config/changes";
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

it("resets only the selected runtime scope and preserves persisted receipts", () => {
  // Arrange
  const input = layers({ global: { verbosity: "medium" } });
  const edits = changes();
  const selector = { model: model.id };
  setCommand(input, edits, selector, { verbosity: "low", webSearch: true });
  completeSave(edits, prepareSave(input, edits), "global");
  setCommand(input, edits, { provider: model.provider }, { reasoningSummary: "auto" });

  // Act / Assert
  resetCommand(input, edits, selector, "verbosity");
  expect(resolveSettings(input, model).values).toMatchObject({ verbosity: "medium", webSearch: true });
  resetCommand(input, edits, selector);
  expect(automaticScope(input, model)).toEqual({ provider: model.provider });
  expect(edits.pending).toHaveLength(1);
  resetCommand(input, edits);
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

it("preserves reset during a save and merges receipts per destination and selector", () => {
  // Arrange
  const input = layers();
  const edits = changes();
  setCommand(input, edits, {}, { verbosity: "low" });
  const batch = prepareSave(input, edits);
  resetCommand(input, edits);

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

it("resets exact scopes and exposes broader command overrides before loaded values", () => {
  // Arrange
  const input = layers({ environment: { verbosity: "medium" } });
  const edits = changes();
  setCommand(input, edits, {}, { verbosity: "medium" });
  setCommand(input, edits, { provider: model.provider }, { verbosity: "high" });
  setCommand(input, edits, { model: model.id }, { verbosity: "low", webSearch: true });

  // Act / Assert
  resetCommand(input, edits, commandScope(input, model), "verbosity");
  expect(resolveSettings(input, model).values).toMatchObject({ verbosity: "high", webSearch: true });
  expect(edits.pending).toContainEqual({ match: { model: model.id }, settings: { webSearch: true } });
  resetCommand(input, edits, commandScope(input, model, "all"));
  expect(resolveSettings(input, model).values.verbosity).toBe("high");
  expect(edits.pending).toHaveLength(2);
  resetCommand(input, edits, commandScope(input, model, "provider"));
  expect(resolveSettings(input, model).values.verbosity).toBe("medium");
  resetCommand(input, edits);
  expect(input.command).toEqual({});
  expect(edits.pending).toEqual([]);
});

it("does not fall through when the automatic reset target has no command value for the setting", () => {
  // Arrange
  const input = layers({
    global: { overrides: [{ match: { provider: model.provider, model: model.id }, settings: { webSearch: true } }] },
  });
  const edits = changes();
  setCommand(input, edits, { provider: model.provider }, { verbosity: "high" });
  const before = structuredClone(edits);

  // Act
  const target = commandScope(input, model);
  resetCommand(input, edits, target, "verbosity");

  // Assert
  expect(target).toEqual({ provider: model.provider, model: model.id });
  expect(resolveSettings(input, model).values.verbosity).toBe("high");
  expect(edits).toEqual(before);
});
