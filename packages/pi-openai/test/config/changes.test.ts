import { expect, expectTypeOf, it } from "vitest";
import { Verbosity, Destination, ReasoningSummary } from "#src/constants";
import {
  PendingEditType,
  completeSave,
  editPatch,
  prepareSave,
  undoCommand,
  unsetCommand,
  setCommand,
  type Changes,
  type FilePatch,
  type PendingEdit,
} from "#src/config/changes";
import { automaticScope, commandScope, type Selector } from "#src/config/scopes";
import { resolveSettings, Setting, type Settings } from "#src/config/settings";
import { layers, model } from "#test/support";

function changes(): Changes {
  return { pending: [], receipts: [] };
}

it("captures each setting, source and scope without copying inherited or environment values", () => {
  // Arrange
  const input = layers({ global: { webSearch: true }, environment: { verbosity: Verbosity.HIGH } });
  const edits = changes();
  const match = { model: model.id };

  // Act
  setCommand(input, edits, match, { verbosity: Verbosity.LOW, reasoningSummary: null }, Destination.PROJECT);
  match.model = "changed-later";
  const batch = prepareSave(edits);

  // Assert
  expect(batch).toEqual([
    {
      destination: Destination.PROJECT,
      match: { model: model.id },
      type: PendingEditType.SET,
      setting: "verbosity",
      value: Verbosity.LOW,
    },
    {
      destination: Destination.PROJECT,
      match: { model: model.id },
      type: PendingEditType.SET,
      setting: "reasoningSummary",
      value: null,
    },
  ]);
  expect(resolveSettings(input, model).values).toMatchObject({ verbosity: Verbosity.LOW, webSearch: true });
  expect(resolveSettings(input, { ...model, id: "other" }).values.verbosity).toBe(Verbosity.HIGH);
});

it("keeps source and scope fixed and runtime values active after saving", () => {
  // Arrange
  const input = layers({ global: { verbosity: Verbosity.MEDIUM } });
  const edits = changes();
  setCommand(input, edits, { model: model.id }, { verbosity: Verbosity.LOW }, Destination.PROJECT);
  const before = structuredClone(input);
  const batch = prepareSave(edits);

  // Act
  completeSave(edits, batch);

  // Assert
  expect(input).toEqual(before);
  expect(edits.pending).toEqual([]);
  expect(edits.receipts).toEqual([
    { destination: Destination.PROJECT, match: { model: model.id }, settings: { verbosity: Verbosity.LOW } },
  ]);
  expect(automaticScope(input, model)).toEqual({ model: model.id });
  expect(prepareSave(edits)).toEqual([]);
});

it("keeps edits to the same setting and scope separate by source", () => {
  // Arrange
  const input = layers();
  const edits = changes();

  // Act
  setCommand(input, edits, {}, { verbosity: Verbosity.LOW }, Destination.GLOBAL);
  setCommand(input, edits, {}, { verbosity: Verbosity.HIGH }, Destination.PROJECT);
  unsetCommand(input, edits, {}, Setting.VERBOSITY, Destination.GLOBAL);

  // Assert
  expect(edits.pending).toEqual([
    {
      destination: Destination.PROJECT,
      match: {},
      type: PendingEditType.SET,
      setting: "verbosity",
      value: Verbosity.HIGH,
    },
    { destination: Destination.GLOBAL, match: {}, type: PendingEditType.UNSET, setting: Setting.VERBOSITY },
  ]);
});

it("filters saves by exact scope kind across models and by source without retargeting", () => {
  // Arrange
  const input = layers();
  const edits = changes();
  setCommand(input, edits, {}, { enabled: false }, Destination.GLOBAL);
  setCommand(input, edits, { model: model.id }, { verbosity: Verbosity.LOW }, Destination.GLOBAL);
  setCommand(input, edits, { model: "other" }, { verbosity: Verbosity.HIGH }, Destination.PROJECT);
  setCommand(input, edits, { provider: model.provider, model: model.id }, { webSearch: true }, Destination.PROJECT);
  const before = structuredClone(edits);

  // Act / Assert
  expect(prepareSave(edits, { scope: "model" })).toEqual(before.pending.slice(1, 3));
  expect(prepareSave(edits, { scope: "all" })).toEqual(before.pending.slice(0, 1));
  expect(prepareSave(edits, { source: Destination.PROJECT })).toEqual(before.pending.slice(2));
  expect(prepareSave(edits, { source: Destination.PROJECT, scope: "model" })).toEqual(before.pending.slice(2, 3));
  expect(prepareSave(edits, { scope: "api" })).toEqual([]);
  expect(edits).toEqual(before);
});

it("clears only saved edits and leaves other files and scopes pending", () => {
  // Arrange
  const input = layers();
  const edits = changes();
  setCommand(input, edits, {}, { verbosity: Verbosity.LOW }, Destination.GLOBAL);
  setCommand(input, edits, {}, { verbosity: Verbosity.HIGH }, Destination.PROJECT);
  setCommand(input, edits, { model: model.id }, { verbosity: Verbosity.MEDIUM }, Destination.PROJECT);

  // Act
  completeSave(edits, prepareSave(edits, { source: Destination.PROJECT, scope: "all" }));

  // Assert
  expect(edits.pending).toEqual([
    {
      destination: Destination.GLOBAL,
      match: {},
      type: PendingEditType.SET,
      setting: "verbosity",
      value: Verbosity.LOW,
    },
    {
      destination: Destination.PROJECT,
      match: { model: model.id },
      type: PendingEditType.SET,
      setting: "verbosity",
      value: Verbosity.MEDIUM,
    },
  ]);
  expect(edits.receipts).toEqual([
    { destination: Destination.PROJECT, match: {}, settings: { verbosity: Verbosity.HIGH } },
  ]);
});

it("undoes the selected setting at both sources without changing saved receipts", () => {
  // Arrange
  const input = layers({ global: { verbosity: Verbosity.MEDIUM } });
  const edits = changes();
  const match = { model: model.id };
  setCommand(input, edits, match, { verbosity: Verbosity.LOW, webSearch: true }, Destination.GLOBAL);
  completeSave(edits, prepareSave(edits));
  unsetCommand(input, edits, match, Setting.VERBOSITY, Destination.GLOBAL);
  unsetCommand(input, edits, match, Setting.VERBOSITY, Destination.PROJECT);
  setCommand(
    input,
    edits,
    { provider: model.provider },
    { reasoningSummary: ReasoningSummary.AUTO },
    Destination.PROJECT,
  );

  // Act / Assert
  undoCommand(input, edits, match, Setting.VERBOSITY);
  expect(resolveSettings(input, model).values).toMatchObject({ verbosity: Verbosity.MEDIUM, webSearch: true });
  expect(edits.pending).toHaveLength(1);
  undoCommand(input, edits, match);
  expect(automaticScope(input, model)).toEqual({ provider: model.provider });
  undoCommand(input, edits);
  expect(input.command).toEqual({});
  expect(edits.pending).toEqual([]);
  expect(edits.receipts).toHaveLength(1);
});

it.each([Verbosity.LOW, Verbosity.HIGH])(
  "keeps replacement %s edits and clears unrelated edits after saving",
  (value) => {
    // Arrange
    const input = layers();
    const edits = changes();
    setCommand(input, edits, {}, { verbosity: Verbosity.LOW, webSearch: true }, Destination.GLOBAL);
    const batch = prepareSave(edits);

    // Act
    setCommand(input, edits, {}, { verbosity: value }, Destination.GLOBAL);
    completeSave(edits, batch);

    // Assert
    expect(edits.pending[0]).not.toBe(batch[0]);
    expect(edits.pending).toEqual([
      { destination: Destination.GLOBAL, match: {}, type: PendingEditType.SET, setting: "verbosity", value },
    ]);
    expect(edits.receipts).toEqual([
      { destination: Destination.GLOBAL, match: {}, settings: { verbosity: Verbosity.LOW, webSearch: true } },
    ]);
    expect(input.command.verbosity).toBe(value);
  },
);

it("does not retain an unchanged saved edit when another key is undone during a save", () => {
  // Arrange
  const input = layers();
  const edits = changes();
  setCommand(input, edits, {}, { verbosity: Verbosity.LOW, webSearch: true }, Destination.GLOBAL);
  const batch = prepareSave(edits);

  // Act
  undoCommand(input, edits, {}, Setting.VERBOSITY);
  completeSave(edits, batch);

  // Assert
  expect(edits.pending).toEqual([]);
  expect(input.command).toEqual({ webSearch: true });
  expect(edits.receipts[0]?.settings).toEqual({ verbosity: Verbosity.LOW, webSearch: true });
});

it("preserves undo during a save and merges receipts per source and selector", () => {
  // Arrange
  const input = layers();
  const edits = changes();
  setCommand(input, edits, {}, { verbosity: Verbosity.LOW }, Destination.GLOBAL);
  const batch = prepareSave(edits);
  undoCommand(input, edits);

  // Act
  completeSave(edits, batch);
  setCommand(input, edits, {}, { webSearch: true }, Destination.GLOBAL);
  completeSave(edits, prepareSave(edits));
  setCommand(input, edits, {}, { verbosity: Verbosity.HIGH }, Destination.PROJECT);
  completeSave(edits, prepareSave(edits));

  // Assert
  expect(edits.receipts).toEqual([
    { destination: Destination.GLOBAL, match: {}, settings: { verbosity: Verbosity.LOW, webSearch: true } },
    { destination: Destination.PROJECT, match: {}, settings: { verbosity: Verbosity.HIGH } },
  ]);
  expect(edits.pending).toEqual([]);
});

it("undoes exact scopes and exposes broader command overrides before loaded values", () => {
  // Arrange
  const input = layers({ environment: { verbosity: Verbosity.MEDIUM } });
  const edits = changes();
  setCommand(input, edits, {}, { verbosity: Verbosity.MEDIUM }, Destination.GLOBAL);
  setCommand(input, edits, { provider: model.provider }, { verbosity: Verbosity.HIGH }, Destination.GLOBAL);
  setCommand(input, edits, { model: model.id }, { verbosity: Verbosity.LOW, webSearch: true }, Destination.PROJECT);

  // Act / Assert
  undoCommand(input, edits, commandScope(input, model), Setting.VERBOSITY);
  expect(resolveSettings(input, model).values).toMatchObject({ verbosity: Verbosity.HIGH, webSearch: true });
  expect(edits.pending).toContainEqual({
    destination: Destination.PROJECT,
    match: { model: model.id },
    type: PendingEditType.SET,
    setting: "webSearch",
    value: true,
  });
  undoCommand(input, edits, commandScope(input, model, "all"));
  expect(resolveSettings(input, model).values.verbosity).toBe(Verbosity.HIGH);
  expect(edits.pending).toHaveLength(2);
  undoCommand(input, edits, commandScope(input, model, "provider"));
  expect(resolveSettings(input, model).values.verbosity).toBe(Verbosity.MEDIUM);
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
  setCommand(input, edits, { provider: model.provider }, { verbosity: Verbosity.HIGH }, Destination.GLOBAL);
  const before = structuredClone(edits);

  // Act
  const target = commandScope(input, model);
  undoCommand(input, edits, target, Setting.VERBOSITY);

  // Assert
  expect(target).toEqual({ provider: model.provider, model: model.id });
  expect(resolveSettings(input, model).values.verbosity).toBe(Verbosity.HIGH);
  expect(edits).toEqual(before);
});

it("replaces sets and removals only at the same source, scope and key", () => {
  // Arrange
  const input = layers({ global: { verbosity: Verbosity.HIGH } });
  const edits = changes();
  setCommand(input, edits, {}, { verbosity: null, webSearch: true }, Destination.GLOBAL);
  unsetCommand(input, edits, {}, Setting.VERBOSITY, Destination.PROJECT);

  // Act / Assert
  unsetCommand(input, edits, {}, Setting.VERBOSITY, Destination.GLOBAL);
  expect(input.command).toEqual({ webSearch: true });
  expect(input.global).toEqual({ verbosity: Verbosity.HIGH });
  setCommand(input, edits, {}, { verbosity: Verbosity.LOW }, Destination.GLOBAL);
  expect(edits.pending).toEqual([
    { destination: Destination.GLOBAL, match: {}, type: PendingEditType.SET, setting: "webSearch", value: true },
    { destination: Destination.PROJECT, match: {}, type: PendingEditType.UNSET, setting: Setting.VERBOSITY },
    {
      destination: Destination.GLOBAL,
      match: {},
      type: PendingEditType.SET,
      setting: "verbosity",
      value: Verbosity.LOW,
    },
  ]);
});

it("replaces saved values with removals while preserving other receipts", () => {
  // Arrange
  const input = layers();
  const edits = changes();
  setCommand(input, edits, {}, { verbosity: Verbosity.LOW, webSearch: true }, Destination.GLOBAL);
  setCommand(input, edits, {}, { verbosity: Verbosity.HIGH }, Destination.PROJECT);
  completeSave(edits, prepareSave(edits));

  // Act
  unsetCommand(input, edits, {}, Setting.VERBOSITY, Destination.GLOBAL);
  completeSave(edits, prepareSave(edits));

  // Assert
  expect(edits.receipts).toEqual([
    { destination: Destination.PROJECT, match: {}, settings: { verbosity: Verbosity.HIGH } },
    { destination: Destination.GLOBAL, match: {}, settings: { webSearch: true }, unset: [Setting.VERBOSITY] },
  ]);
});

it.each(["set", "unset", "undo"])("keeps %s during a removal save", (action) => {
  // Arrange
  const input = layers();
  const edits = changes();
  unsetCommand(input, edits, {}, Setting.VERBOSITY, Destination.GLOBAL);
  const batch = prepareSave(edits);

  // Act
  if (action === "set") {
    setCommand(input, edits, {}, { verbosity: Verbosity.LOW }, Destination.GLOBAL);
  } else if (action === "unset") {
    unsetCommand(input, edits, {}, Setting.VERBOSITY, Destination.PROJECT);
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
            ? {
                destination: Destination.GLOBAL,
                match: {},
                type: PendingEditType.SET,
                setting: "verbosity",
                value: Verbosity.LOW,
              }
            : { destination: Destination.PROJECT, match: {}, type: PendingEditType.UNSET, setting: Setting.VERBOSITY },
        ],
  );
  expect(edits.receipts).toEqual([
    { destination: Destination.GLOBAL, match: {}, settings: {}, unset: [Setting.VERBOSITY] },
  ]);
});

it("requires one operation with a value matching its setting", () => {
  // Arrange
  type Target = Pick<PendingEdit, "destination" | "match">;
  type VerbosityEdit = Extract<PendingEdit, { type: typeof PendingEditType.SET; setting: "verbosity" }>;

  // Assert
  expectTypeOf<VerbosityEdit["value"]>().toEqualTypeOf<Settings["verbosity"]>();
  expectTypeOf<
    Target & { type: typeof PendingEditType.SET; setting: "verbosity"; value: boolean }
  >().not.toExtend<PendingEdit>();
  expectTypeOf<
    Target & { type: typeof PendingEditType.UNSET; setting: "verbosity"; value: "low" }
  >().not.toExtend<PendingEdit>();
  expectTypeOf<Target & { type: typeof PendingEditType.SET; setting: "verbosity" }>().not.toExtend<PendingEdit>();
  expectTypeOf<FilePatch>().not.toExtend<PendingEdit>();
});

it("exposes readonly pending entries, selectors and save batches", () => {
  // Assert
  expectTypeOf<PendingEdit>().branded.toEqualTypeOf<Readonly<PendingEdit>>();
  expectTypeOf<PendingEdit["match"]>().toEqualTypeOf<Readonly<Selector>>();
  expectTypeOf<Changes["pending"]>().toEqualTypeOf<readonly PendingEdit[]>();
  expectTypeOf<ReturnType<typeof prepareSave>>().toEqualTypeOf<readonly PendingEdit[]>();
});

it("freezes set and unset entries while preserving their identities in save batches", () => {
  // Arrange
  const input = layers();
  const edits = changes();
  const match = { model: model.id };
  setCommand(input, edits, match, { verbosity: Verbosity.LOW }, Destination.GLOBAL);
  unsetCommand(input, edits, match, Setting.WEB_SEARCH, Destination.GLOBAL);

  // Act
  const batch = prepareSave(edits);
  match.model = "changed-later";

  // Assert
  expect(batch).toHaveLength(2);
  expect(batch).not.toBe(edits.pending);
  for (const edit of batch) {
    expect(edits.pending).toContain(edit);
    expect(Object.isFrozen(edit)).toBe(true);
    expect(Object.isFrozen(edit.match)).toBe(true);
    expect(Reflect.set(edit, "destination", Destination.PROJECT)).toBe(false);
    expect(Reflect.set(edit, "value", Verbosity.HIGH)).toBe(false);
    expect(Reflect.set(edit.match, "model", "different")).toBe(false);
    expect(edit.match).toEqual({ model: model.id });
  }
});

it("converts edits to independent file patches without losing nulls, false values or removals", () => {
  // Arrange
  const input = layers();
  const edits = changes();
  const match = { model: model.id };
  setCommand(input, edits, match, { verbosity: null, webSearch: false }, Destination.GLOBAL);
  unsetCommand(input, edits, match, Setting.REASONING_SUMMARY, Destination.GLOBAL);
  const batch = prepareSave(edits);
  const expected = [
    { destination: Destination.GLOBAL, match, settings: { verbosity: null } },
    { destination: Destination.GLOBAL, match, settings: { webSearch: false } },
    { destination: Destination.GLOBAL, match, settings: {}, unset: [Setting.REASONING_SUMMARY] },
  ];

  // Act
  const patches = batch.map(editPatch);

  // Assert
  expect(patches).toEqual(expected);
  for (const patch of patches) {
    patch.match.model = "different";
    patch.settings.enabled = false;
    patch.unset?.push(Setting.ENABLED);
  }
  expect(batch.map(editPatch)).toEqual(expected);
});
