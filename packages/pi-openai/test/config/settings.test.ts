import { describe, expect, it } from "vitest";
import {
  choices,
  defaults,
  environmentNames,
  parseSetting,
  readEnvironment,
  resolveSettings,
  settingNames,
  validateSettings,
} from "#src/config/settings";
import { layers, model } from "#test/support";

it("uses independent defaults with source information", () => {
  // Act
  const first = resolveSettings(layers());
  const second = resolveSettings(layers());

  // Assert
  expect(first.values).toEqual(defaults);
  expect(first.values).not.toBe(second.values);
  expect(Object.values(first.sources)).toEqual(settingNames.map(() => "default"));
});

it("merges each key with command > environment > project > global precedence", () => {
  // Arrange
  const input = layers({
    global: { enabled: false, verbosity: "high", reasoningSummary: "auto", webSearch: true },
    project: { verbosity: "medium", reasoningSummary: null },
    environment: { verbosity: "low", serviceTier: "priority" },
    command: { verbosity: null, allowUnsupported: true },
  });

  // Act
  const resolved = resolveSettings(input);

  // Assert
  expect(resolved.values).toEqual({
    enabled: false,
    verbosity: null,
    reasoningSummary: null,
    webSearch: true,
    serviceTier: "priority",
    allowUnsupported: true,
  });
  expect(resolved.sources).toEqual({
    enabled: "global",
    verbosity: "command",
    reasoningSummary: "project",
    webSearch: "global",
    serviceTier: "environment",
    allowUnsupported: "command",
  });
});

for (const key of settingNames) {
  describe(key, () => {
    it.each([...choices[key]])("accepts %s in JSON, environment and commands", (value) => {
      // Arrange
      const expected = { [key]: value };

      // Act / Assert
      expect(validateSettings(expected)).toEqual(expected);
      expect(parseSetting(key, String(value))).toEqual(expected);
      expect(readEnvironment({ [environmentNames[key]]: String(value) })).toEqual(expected);
    });

    it.each(["", "undefined", "invalid", "TRUE", "1"])("rejects invalid string %j", (value) => {
      // Act / Assert
      expect(() => parseSetting(key, value)).toThrow(`${key} must be one of`);
      expect(() => readEnvironment({ [environmentNames[key]]: value })).toThrow(environmentNames[key]);
    });

    it.each([undefined, 0, {}, [], "invalid"])("rejects invalid JSON value %j", (value) => {
      // Act / Assert
      expect(() => validateSettings({ [key]: value })).toThrow(`${key} must be one of`);
    });
  });
}

it("ignores unrelated keys without reading inherited settings", () => {
  // Arrange
  const object: Record<string, unknown> = Object.create({ verbosity: "high" }) as Record<string, unknown>;
  object.futureSetting = 42;

  // Act / Assert
  expect(validateSettings(object)).toEqual({});
  expect(readEnvironment({ OPENAI_API_KEY: "private", OTHER_SETTING: "true" })).toEqual({});
});

it("distinguishes null, none, omission, and typed booleans", () => {
  // Act / Assert
  expect(validateSettings({})).toEqual({});
  expect(parseSetting("reasoningSummary", "null")).toEqual({ reasoningSummary: null });
  expect(parseSetting("reasoningSummary", "none")).toEqual({ reasoningSummary: "none" });
  expect(() => validateSettings({ enabled: "false" })).toThrow();
  expect(() => validateSettings({ webSearch: null })).toThrow();
  expect(() => validateSettings({ serviceTier: null })).toThrow();
});

it("normalizes the fast alias in JSON, environment and command values", () => {
  // Arrange
  const expected = { serviceTier: "priority" };

  // Act / Assert
  expect(validateSettings({ serviceTier: "fast" })).toEqual(expected);
  expect(parseSetting("serviceTier", " fast ")).toEqual(expected);
  expect(readEnvironment({ PI_OPENAI_SERVICE_TIER: " fast " })).toEqual(expected);
  expect(choices.serviceTier).toEqual(["default", "priority", "ultrafast"]);
  expect(() => validateSettings({ serviceTier: " fast " })).toThrow();
  expect(() => parseSetting("serviceTier", "FAST")).toThrow();
});

it("merges matching scopes per key and reports their exact provenance", () => {
  // Arrange
  const input = layers({
    global: {
      verbosity: "high",
      overrides: [
        { match: { model: model.id }, settings: { verbosity: "low" } },
        { match: { provider: model.provider }, settings: { verbosity: "medium", serviceTier: "priority" } },
        { match: { api: model.api }, settings: { verbosity: "high", reasoningSummary: "auto" } },
        { match: { model: "other" }, settings: { enabled: false } },
      ],
    },
  });

  // Act
  const effective = resolveSettings(input, model);

  // Assert
  expect(effective.values).toMatchObject({
    enabled: true,
    verbosity: "low",
    serviceTier: "priority",
    reasoningSummary: "auto",
  });
  expect(effective.scopes.verbosity).toEqual({ model: model.id });
  expect(effective.scopes.serviceTier).toEqual({ provider: model.provider });
  expect(effective.scopes.reasoningSummary).toEqual({ api: model.api });
  expect(effective.sources.verbosity).toBe("global");
  input.global.overrides?.reverse();
  expect(resolveSettings(input, model)).toEqual(effective);
});

it("prioritizes all combinations without relying on declaration order", () => {
  // Arrange
  const selectors = [
    { api: model.api },
    { provider: model.provider },
    { model: model.id },
    { provider: model.provider, api: model.api },
    { model: model.id, api: model.api },
    { provider: model.provider, model: model.id },
    { provider: model.provider, model: model.id, api: model.api },
  ];

  // Act / Assert
  for (let index = 0; index < selectors.length; index++) {
    const input = layers({
      global: {
        overrides: selectors
          .slice(0, index + 1)
          .toReversed()
          .map((match) => ({ match, settings: { verbosity: "low" } })),
      },
    });
    expect(resolveSettings(input, model).scopes.verbosity).toEqual(selectors[index]);
  }
});

it("keeps layer precedence stronger than selector specificity", () => {
  // Arrange
  const input = layers({
    global: {
      overrides: [
        {
          match: { provider: model.provider, model: model.id, api: model.api },
          settings: { verbosity: "high", reasoningSummary: "auto", webSearch: true },
        },
      ],
    },
    project: { verbosity: "low", reasoningSummary: null, webSearch: false },
  });

  // Act / Assert
  expect(resolveSettings(input, model).values).toMatchObject({
    verbosity: "low",
    reasoningSummary: null,
    webSearch: false,
  });
  expect(resolveSettings(input, model).scopes.verbosity).toEqual({});
  input.environment = { verbosity: "medium" };
  expect(resolveSettings(input, model).sources.verbosity).toBe("environment");
  input.command = { overrides: [{ match: { api: model.api }, settings: { verbosity: null } }] };
  expect(resolveSettings(input, model).values.verbosity).toBeNull();
  expect(resolveSettings(input, model).sources.verbosity).toBe("command");
});

it("ignores every scoped rule when no model is selected", () => {
  // Arrange
  const input = layers({
    global: { verbosity: "medium", overrides: [{ match: { model: model.id }, settings: { verbosity: "high" } }] },
    command: { overrides: [{ match: { api: model.api }, settings: { verbosity: "low" } }] },
  });

  // Act / Assert
  expect(resolveSettings(input).values.verbosity).toBe("medium");
});
