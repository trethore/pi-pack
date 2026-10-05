import { expect, it } from "vitest";
import { completeSave, prepareSave, undoCommand, unsetCommand, setCommand, type Changes } from "#src/config/changes";
import { automaticScope, commandScope } from "#src/config/scopes";
import { resolveSettings } from "#src/config/settings";
import { layers, model } from "#test/support";

function changes(): Changes {
  return { pending: [], receipts: [] };
}

it("captures each setting, source and scope without copying inherited or environment values", () => {
  // Arrange
  const input = layers({ global: { webSearch: true }, environment: { verbosity: "high" } });
  const edits = changes();
  const match = { model: model.id };

  // Act
  setCommand(input, edits, match, { verbosity: "low", reasoningSummary: null }, "project");
  match.model = "changed-later";
  const batch = prepareSave(edits);

  // Assert
  expect(batch).toEqual([
    { destination: "project", match: { model: model.id }, settings: { verbosity: "low" } },
    { destination: "project", match: { model: model.id }, settings: { reasoningSummary: null } },
  ]);
  expect(resolveSettings(input, model).values).toMatchObject({ verbosity: "low", webSearch: true });
  expect(resolveSettings(input, { ...model, id: "other" }).values.verbosity).toBe("high");
});

it("keeps source and scope fixed and runtime values active after saving", () => {
  // Arrange
  const input = layers({ global: { verbosity: "medium" } });
  const edits = changes();
  setCommand(input, edits, { model: model.id }, { verbosity: "low" }, "project");
  const before = structuredClone(input);
  const batch = prepareSave(edits);

  // Act
  completeSave(edits, batch);

  // Assert
  expect(input).toEqual(before);
  expect(edits.pending).toEqual([]);
  expect(edits.receipts).toEqual([
    { destination: "project", match: { model: model.id }, settings: { verbosity: "low" } },
  ]);
  expect(automaticScope(input, model)).toEqual({ model: model.id });
  expect(prepareSave(edits)).toEqual([]);
});

it("keeps edits to the same setting and scope separate by source", () => {
  // Arrange
  const input = layers();
  const edits = changes();

  // Act
  setCommand(input, edits, {}, { verbosity: "low" }, "global");
  setCommand(input, edits, {}, { verbosity: "high" }, "project");
  unsetCommand(input, edits, {}, "verbosity", "global");

  // Assert
  expect(edits.pending).toEqual([
    { destination: "project", match: {}, settings: { verbosity: "high" } },
    { destination: "global", match: {}, settings: {}, unset: ["verbosity"] },
  ]);
});

it("filters saves by exact scope kind across models and by source without retargeting", () => {
  // Arrange
  const input = layers();
  const edits = changes();
  setCommand(input, edits, {}, { enabled: false }, "global");
  setCommand(input, edits, { model: model.id }, { verbosity: "low" }, "global");
  setCommand(input, edits, { model: "other" }, { verbosity: "high" }, "project");
  setCommand(input, edits, { provider: model.provider, model: model.id }, { webSearch: true }, "project");
  const before = structuredClone(edits);

  // Act / Assert
  expect(prepareSave(edits, { scope: "model" })).toEqual(before.pending.slice(1, 3));
  expect(prepareSave(edits, { scope: "all" })).toEqual(before.pending.slice(0, 1));
  expect(prepareSave(edits, { source: "project" })).toEqual(before.pending.slice(2));
  expect(prepareSave(edits, { source: "project", scope: "model" })).toEqual(before.pending.slice(2, 3));
  expect(prepareSave(edits, { scope: "api" })).toEqual([]);
  expect(edits).toEqual(before);
});

it("clears only saved edits and leaves other files and scopes pending", () => {
  // Arrange
  const input = layers();
  const edits = changes();
  setCommand(input, edits, {}, { verbosity: "low" }, "global");
  setCommand(input, edits, {}, { verbosity: "high" }, "project");
  setCommand(input, edits, { model: model.id }, { verbosity: "medium" }, "project");

  // Act
  completeSave(edits, prepareSave(edits, { source: "project", scope: "all" }));

  // Assert
  expect(edits.pending).toEqual([
    { destination: "global", match: {}, settings: { verbosity: "low" } },
    { destination: "project", match: { model: model.id }, settings: { verbosity: "medium" } },
  ]);
  expect(edits.receipts).toEqual([{ destination: "project", match: {}, settings: { verbosity: "high" } }]);
});

it("undoes the selected setting at both sources without changing saved receipts", () => {
  // Arrange
  const input = layers({ global: { verbosity: "medium" } });
  const edits = changes();
  const match = { model: model.id };
  setCommand(input, edits, match, { verbosity: "low", webSearch: true }, "global");
  completeSave(edits, prepareSave(edits));
  unsetCommand(input, edits, match, "verbosity", "global");
  unsetCommand(input, edits, match, "verbosity", "project");
  setCommand(input, edits, { provider: model.provider }, { reasoningSummary: "auto" }, "project");

  // Act / Assert
  undoCommand(input, edits, match, "verbosity");
  expect(resolveSettings(input, model).values).toMatchObject({ verbosity: "medium", webSearch: true });
  expect(edits.pending).toHaveLength(1);
  undoCommand(input, edits, match);
  expect(automaticScope(input, model)).toEqual({ provider: model.provider });
  undoCommand(input, edits);
  expect(input.command).toEqual({});
  expect(edits.pending).toEqual([]);
  expect(edits.receipts).toHaveLength(1);
});

it("does not lose replaced edits or retain unrelated saved keys during an asynchronous save", () => {
  // Arrange
  const input = layers();
  const edits = changes();
  setCommand(input, edits, {}, { verbosity: "low", webSearch: true }, "global");
  const batch = prepareSave(edits);

  // Act
  setCommand(input, edits, {}, { verbosity: "high" }, "global");
  completeSave(edits, batch);

  // Assert
  expect(edits.pending).toEqual([{ destination: "global", match: {}, settings: { verbosity: "high" } }]);
  expect(edits.receipts).toEqual([
    { destination: "global", match: {}, settings: { verbosity: "low", webSearch: true } },
  ]);
  expect(input.command.verbosity).toBe("high");
});

it("does not retain an unchanged saved edit when another key is undone during a save", () => {
  // Arrange
  const input = layers();
  const edits = changes();
  setCommand(input, edits, {}, { verbosity: "low", webSearch: true }, "global");
  const batch = prepareSave(edits);

  // Act
  undoCommand(input, edits, {}, "verbosity");
  completeSave(edits, batch);

  // Assert
  expect(edits.pending).toEqual([]);
  expect(input.command).toEqual({ webSearch: true });
  expect(edits.receipts[0]?.settings).toEqual({ verbosity: "low", webSearch: true });
});

it("preserves undo during a save and merges receipts per source and selector", () => {
  // Arrange
  const input = layers();
  const edits = changes();
  setCommand(input, edits, {}, { verbosity: "low" }, "global");
  const batch = prepareSave(edits);
  undoCommand(input, edits);

  // Act
  completeSave(edits, batch);
  setCommand(input, edits, {}, { webSearch: true }, "global");
  completeSave(edits, prepareSave(edits));
  setCommand(input, edits, {}, { verbosity: "high" }, "project");
  completeSave(edits, prepareSave(edits));

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
  setCommand(input, edits, {}, { verbosity: "medium" }, "global");
  setCommand(input, edits, { provider: model.provider }, { verbosity: "high" }, "global");
  setCommand(input, edits, { model: model.id }, { verbosity: "low", webSearch: true }, "project");

  // Act / Assert
  undoCommand(input, edits, commandScope(input, model), "verbosity");
  expect(resolveSettings(input, model).values).toMatchObject({ verbosity: "high", webSearch: true });
  expect(edits.pending).toContainEqual({
    destination: "project",
    match: { model: model.id },
    settings: { webSearch: true },
  });
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
    global: {
      overrides: [{ match: { provider: model.provider, model: model.id }, settings: { webSearch: true } }],
    },
  });
  const edits = changes();
  setCommand(input, edits, { provider: model.provider }, { verbosity: "high" }, "global");
  const before = structuredClone(edits);

  // Act
  const target = commandScope(input, model);
  undoCommand(input, edits, target, "verbosity");

  // Assert
  expect(target).toEqual({ provider: model.provider, model: model.id });
  expect(resolveSettings(input, model).values.verbosity).toBe("high");
  expect(edits).toEqual(before);
});

it("replaces sets and removals only at the same source, scope and key", () => {
  // Arrange
  const input = layers({ global: { verbosity: "high" } });
  const edits = changes();
  setCommand(input, edits, {}, { verbosity: null, webSearch: true }, "global");
  unsetCommand(input, edits, {}, "verbosity", "project");

  // Act / Assert
  unsetCommand(input, edits, {}, "verbosity", "global");
  expect(input.command).toEqual({ webSearch: true });
  expect(input.global).toEqual({ verbosity: "high" });
  setCommand(input, edits, {}, { verbosity: "low" }, "global");
  expect(edits.pending).toEqual([
    { destination: "global", match: {}, settings: { webSearch: true } },
    { destination: "project", match: {}, settings: {}, unset: ["verbosity"] },
    { destination: "global", match: {}, settings: { verbosity: "low" } },
  ]);
});

it("replaces saved values with removals while preserving other receipts", () => {
  // Arrange
  const input = layers();
  const edits = changes();
  setCommand(input, edits, {}, { verbosity: "low", webSearch: true }, "global");
  setCommand(input, edits, {}, { verbosity: "high" }, "project");
  completeSave(edits, prepareSave(edits));

  // Act
  unsetCommand(input, edits, {}, "verbosity", "global");
  completeSave(edits, prepareSave(edits));

  // Assert
  expect(edits.receipts).toEqual([
    { destination: "project", match: {}, settings: { verbosity: "high" } },
    { destination: "global", match: {}, settings: { webSearch: true }, unset: ["verbosity"] },
  ]);
});

it.each(["set", "unset", "undo"])("keeps %s during a removal save", (action) => {
  // Arrange
  const input = layers();
  const edits = changes();
  unsetCommand(input, edits, {}, "verbosity", "global");
  const batch = prepareSave(edits);

  // Act
  if (action === "set") {
    setCommand(input, edits, {}, { verbosity: "low" }, "global");
  } else if (action === "unset") {
    unsetCommand(input, edits, {}, "verbosity", "project");
  } else {
    undoCommand(input, edits);
  }
  completeSave(edits, batch);

  // Assert
  expect(edits.pending).toEqual(
    action === "undo"
      ? []
      : [
          action === "set"
            ? { destination: "global", match: {}, settings: { verbosity: "low" } }
            : { destination: "project", match: {}, settings: {}, unset: ["verbosity"] },
        ],
  );
  expect(edits.receipts).toEqual([{ destination: "global", match: {}, settings: {}, unset: ["verbosity"] }]);
});
