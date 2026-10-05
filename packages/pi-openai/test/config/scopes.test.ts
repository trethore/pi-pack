import { expect, it } from "vitest";
import { Verbosity, ReasoningSummary } from "#src/constants";
import {
  automaticScope,
  commandScope,
  explicitScope,
  matchesScope,
  scopeId,
  scopeRank,
  scopeNames,
  validateSelector,
  type Selector,
} from "#src/config/scopes";
import { layers, model } from "#test/support";

const ordered: Selector[] = [
  {},
  { api: model.api },
  { provider: model.provider },
  { model: model.id },
  { provider: model.provider, api: model.api },
  { model: model.id, api: model.api },
  { provider: model.provider, model: model.id },
  { provider: model.provider, model: model.id, api: model.api },
];

it("ranks all combinations by field count, then model, provider, API", () => {
  // Act
  const sorted = ordered.toReversed().sort((left, right) => scopeRank(left) - scopeRank(right));

  // Assert
  expect(sorted).toEqual(ordered);
  expect(scopeNames.map((scope) => explicitScope(scope, model))).toEqual(ordered);
});

it.each(ordered)("matches exact identities for %j", (selector) => {
  // Act / Assert
  expect(matchesScope(selector, model)).toBe(true);
  expect(matchesScope(selector, undefined)).toBe(Object.keys(selector).length === 0);
  for (const field of Object.keys(selector)) {
    const key = field === "model" ? "id" : field;
    expect(matchesScope(selector, { ...model, [key]: "different" })).toBe(false);
  }
});

it("does not interpret dates, wildcards, or delimiters as selector syntax", () => {
  // Act / Assert
  expect(matchesScope({ model: model.id }, { ...model, id: model.id + "-2026-10-01" })).toBe(false);
  expect(matchesScope({ model: "gpt-*" }, model)).toBe(false);
  expect(scopeId({ provider: "a,b", model: "c" })).not.toBe(scopeId({ provider: "a", model: "b,c" }));
  expect(scopeId({ provider: "a", model: "b" })).toBe(scopeId({ model: "b", provider: "a" }));
  expect(validateSelector({ provider: "__proto__", model: "constructor" })).toEqual({
    provider: "__proto__",
    model: "constructor",
  });
});

it.each([{}, null, [], "", { endpoint: "x" }, { model: "" }, { api: " " }, { provider: 1 }, { model: null }])(
  "rejects invalid selector %j",
  (input) => {
    // Act / Assert
    expect(() => validateSelector(input)).toThrow();
  },
);

it("requires an explicit unscoped target when no model is selected", () => {
  // Act / Assert
  expect(automaticScope(layers(), undefined)).toBeUndefined();
  expect(() => commandScope(layers(), undefined)).toThrow("--scope all");
  expect(() => explicitScope("provider", undefined)).toThrow("--scope all");
  expect(commandScope(layers(), undefined, "all")).toEqual({});
  expect(() => explicitScope("api", { ...model, api: "" })).toThrow("no api identity");
});

it("targets the model rather than provider or API within the same layer", () => {
  // Arrange
  const input = layers({
    global: {
      overrides: [
        { match: { model: model.id }, settings: { verbosity: Verbosity.LOW } },
        { match: { provider: model.provider }, settings: { webSearch: true } },
        { match: { api: model.api }, settings: { reasoningSummary: ReasoningSummary.AUTO } },
      ],
    },
  });

  // Act / Assert
  expect(automaticScope(input, model)).toEqual({ model: model.id });
});

it("breaks equal field counts by runtime, project, then global before field kind", () => {
  // Arrange
  const input = layers({
    global: { overrides: [{ match: { model: model.id }, settings: { verbosity: Verbosity.LOW } }] },
    project: { overrides: [{ match: { provider: model.provider }, settings: {} }] },
  });

  // Act / Assert
  expect(automaticScope(input, model)).toEqual({ provider: model.provider });
  input.command = { overrides: [{ match: { api: model.api }, settings: { enabled: false } }] };
  expect(automaticScope(input, model)).toEqual({ api: model.api });
});

it("prefers more fields even in a lower-priority file", () => {
  // Arrange
  const match = { provider: model.provider, api: model.api };
  const input = layers({
    global: { overrides: [{ match, settings: {} }] },
    project: { overrides: [{ match: { model: model.id }, settings: {} }] },
    command: { overrides: [{ match: { provider: model.provider }, settings: { verbosity: Verbosity.LOW } }] },
  });

  // Act / Assert
  expect(automaticScope(input, model)).toEqual(match);
  expect(commandScope(input, model, "model")).toEqual({ model: model.id });
});

it("falls back to All models for flat config or nonmatching scopes", () => {
  // Arrange
  const input = layers({ project: { overrides: [{ match: { provider: "other" }, settings: {} }] } });

  // Act / Assert
  expect(automaticScope(layers({ global: { verbosity: Verbosity.LOW } }), model)).toEqual({});
  expect(automaticScope(input, model)).toEqual({});
});
