import { expect, it } from "vitest";
import { dedent } from "@pi-pack/shared/dedent";
import { schemaToType } from "#src/declarations/schema";
import type { CodemodeJsonSchema } from "#src/sandbox/types";

it.each<{ name: string; schema: CodemodeJsonSchema; expected: string }>([
  {
    name: "anyOf before oneOf and allOf",
    schema: { anyOf: [{ type: "string" }], oneOf: [{ type: "number" }], allOf: [{ type: "boolean" }] },
    expected: "string",
  },
  {
    name: "empty anyOf before oneOf",
    schema: { anyOf: [], oneOf: [{ type: "number" }] },
    expected: "never",
  },
  {
    name: "oneOf when anyOf is not an array",
    schema: { anyOf: null, oneOf: [{ type: "string" }, { type: "number" }] },
    expected: "string | number",
  },
  {
    name: "allOf with only unknown types",
    schema: { allOf: [true, {}] },
    expected: "unknown",
  },
  {
    name: "allOf with a union and an unknown type",
    schema: { allOf: [{ type: ["string", "number"] }, true, { const: 1 }] },
    expected: "(string | number) & 1",
  },
  {
    name: "legacy tuple items",
    schema: { type: "array", items: [{ type: "string" }, { type: "number" }] },
    expected: "[string, number]",
  },
  {
    name: "prefixItems before legacy tuple items",
    schema: { type: "array", prefixItems: [{ type: "string" }], items: [{ type: "number" }] },
    expected: "[string]",
  },
  {
    name: "empty prefixItems before legacy tuple items",
    schema: { type: "array", prefixItems: [], items: [{ type: "number" }] },
    expected: "unknown[]",
  },
  {
    name: "schema items before prefixItems",
    schema: { type: "array", prefixItems: [{ type: "string" }], items: { type: "number" } },
    expected: "Array<number>",
  },
  {
    name: "object inference before array inference",
    schema: { properties: { value: { type: "string" } }, items: { type: "number" } },
    expected: "{ value?: string; }",
  },
  {
    name: "whitespace-only descriptions without multiline formatting",
    schema: { type: "object", properties: { value: { type: "string", description: " \n " } } },
    expected: "{ value?: string; }",
  },
])("renders $name", ({ schema, expected }) => {
  // Act
  const result = schemaToType(schema);

  // Assert
  expect(result).toBe(expected);
});

it("keeps sorted properties, descriptions, nested indentation, and the index signature together", () => {
  // Arrange
  const schema = {
    type: "object",
    properties: {
      zebra: { type: "number" },
      "alpha-key": {
        type: "object",
        description: " First line. \r\n\r\n Second line. ",
        properties: { inner: { type: "string", description: "Inner value." } },
        required: ["inner"],
      },
    },
    required: ["alpha-key"],
    additionalProperties: { type: "boolean" },
  };

  // Act
  const result = schemaToType(schema);

  // Assert
  expect(result).toBe(
    dedent(`
      {
        // First line.
        // Second line.
        "alpha-key": {
          // Inner value.
          inner: string;
        };
        zebra?: number;
        [key: string]: boolean;
      }
    `),
  );
});

it.each<{ name: string; schema: CodemodeJsonSchema; expected: string }>([
  { name: "implicit", schema: { type: "object" }, expected: "{ [key: string]: unknown; }" },
  { name: "allowed", schema: { type: "object", additionalProperties: true }, expected: "{ [key: string]: unknown; }" },
  { name: "forbidden", schema: { type: "object", additionalProperties: false }, expected: "{}" },
  {
    name: "typed",
    schema: { type: "object", additionalProperties: { type: "number" } },
    expected: "{ [key: string]: number; }",
  },
])("renders an object with no named properties and $name additional properties", ({ schema, expected }) => {
  // Act
  const result = schemaToType(schema);

  // Assert
  expect(result).toBe(expected);
});
