import { encodeJson, isArray } from "#src/sandbox/values";
import type { CodemodeJsonSchema } from "#src/sandbox/types";
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const INDENT = "  ";
const MAX_REF_EXPANSIONS = 32;
function propertyKey(name: string): string {
  return IDENTIFIER.test(name) ? name : JSON.stringify(name);
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !isArray(value);
}

function union(types: string[]): string {
  const unique = [...new Set(types)];
  if (unique.includes("unknown")) {
    return "unknown";
  }
  return unique.length === 0 ? "never" : unique.join(" | ");
}

/**
 * Convert a JSON Schema to a TypeScript type expression: objects on one line (`{ a: string; b?: number; }`) with properties sorted by name,
 * or one property per line with `//` comments when a property has a description; `Array<T>` for
 * arrays. Local references (`#/$defs/...`, `#/definitions/...`) resolve against `schema`;
 * recursive and remote references render as `unknown`. A result longer than `maxChars` renders as
 * `unknown`.
 */
export function schemaToType(schema: CodemodeJsonSchema, options: { maxChars?: number } = {}): string {
  const type = toType(schema, { root: schema, resolving: new Set(), expansions: 0 });
  return options.maxChars !== undefined && type.length > options.maxChars ? "unknown" : type;
}

interface SchemaContext {
  root: CodemodeJsonSchema;
  /** References being expanded on the current path, to stop at recursive types. */
  resolving: Set<string>;
  expansions: number;
}

function resolveRef(ref: string, root: CodemodeJsonSchema): CodemodeJsonSchema | undefined {
  if (ref !== "#" && !ref.startsWith("#/")) {
    return undefined;
  }
  let current: unknown = root;
  for (const segment of ref.slice(2).split("/").filter(Boolean)) {
    const key = decodeURIComponent(segment).replaceAll("~1", "/").replaceAll("~0", "~");
    if (!isObject(current) || !(key in current)) {
      return undefined;
    }
    current = current[key];
  }
  return typeof current === "boolean" || isObject(current) ? current : undefined;
}

function toType(schema: unknown, context: SchemaContext): string {
  if (schema === true) {
    return "unknown";
  }
  if (schema === false) {
    return "never";
  }
  if (!isObject(schema)) {
    return "unknown";
  }
  if (typeof schema.$ref === "string") {
    return referenceType(schema.$ref, context);
  }

  if ("const" in schema) {
    return encodeJson(schema.const) ?? "unknown";
  }
  if (isArray(schema.enum)) {
    return union(schema.enum.map((value) => encodeJson(value) ?? "unknown"));
  }

  return composedType(schema, context) ?? primitiveType(schema, context);
}

function composedType(schema: Record<string, unknown>, context: SchemaContext): string | undefined {
  const variants = isArray(schema.anyOf) ? schema.anyOf : isArray(schema.oneOf) ? schema.oneOf : undefined;
  if (variants) {
    return union(variants.map((variant) => toType(variant, context)));
  }
  if (isArray(schema.allOf)) {
    const parts = schema.allOf.map((part) => toType(part, context)).filter((part) => part !== "unknown");
    return parts.length === 0
      ? "unknown"
      : parts.map((part) => (part.includes(" | ") ? `(${part})` : part)).join(" & ");
  }

  return undefined;
}

function primitiveType(schema: Record<string, unknown>, context: SchemaContext): string {
  const type = schema.type;
  if (isArray(type)) {
    return union(type.map((entry) => toType({ ...schema, type: entry }, context)));
  }
  switch (type) {
    case "string":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "array":
      return arrayType(schema, context);
    case "object":
      return objectType(schema, context);
    case undefined:
      return inferredType(schema, context);
    default:
      return "unknown";
  }
}

function arrayType(schema: Record<string, unknown>, context: SchemaContext): string {
  if (schema.items !== undefined && !isArray(schema.items)) {
    return `Array<${toType(schema.items, context)}>`;
  }
  const tuple = isArray(schema.prefixItems) ? schema.prefixItems : isArray(schema.items) ? schema.items : [];
  if (tuple.length > 0) {
    return `[${tuple.map((item) => toType(item, context)).join(", ")}]`;
  }
  return "unknown[]";
}

function descriptionOf(property: unknown): string {
  return isObject(property) && typeof property.description === "string" ? property.description.trim() : "";
}

function objectType(schema: Record<string, unknown>, context: SchemaContext): string {
  const properties = isObject(schema.properties) ? schema.properties : {};
  const required = new Set(isArray(schema.required) ? schema.required : []);
  const names = Object.keys(properties).sort();
  const members = names.map((name) => {
    const optional = required.has(name) ? "" : "?";
    return `${propertyKey(name)}${optional}: ${toType(properties[name], context)};`;
  });
  appendAdditionalProperties(schema, context, members, names.length);
  if (members.length === 0) {
    return "{}";
  }
  if (!names.some((name) => descriptionOf(properties[name]))) {
    return `{ ${members.join(" ")} }`;
  }

  const lines = ["{"];
  names.forEach((name, index) => {
    for (const line of descriptionOf(properties[name]).split(/\r?\n/)) {
      if (line.trim()) {
        lines.push(`${INDENT}// ${line.trim()}`);
      }
    }
    lines.push(`${INDENT}${(members[index] ?? "").replaceAll("\n", `\n${INDENT}`)}`);
  });
  for (const member of members.slice(names.length)) {
    lines.push(`${INDENT}${member}`);
  }
  lines.push("}");
  return lines.join("\n");
}

function inferredType(schema: Record<string, unknown>, context: SchemaContext): string {
  if ("properties" in schema || "additionalProperties" in schema || "required" in schema) {
    return objectType(schema, context);
  }
  if ("items" in schema || "prefixItems" in schema) {
    return arrayType(schema, context);
  }
  return "unknown";
}
function referenceType(ref: string, context: SchemaContext): string {
  if (context.resolving.has(ref) || context.expansions >= MAX_REF_EXPANSIONS) {
    return "unknown";
  }
  const target = resolveRef(ref, context.root);
  if (target === undefined) {
    return "unknown";
  }
  context.expansions++;
  context.resolving.add(ref);
  try {
    return toType(target, context);
  } finally {
    context.resolving.delete(ref);
  }
}

function appendAdditionalProperties(
  schema: Record<string, unknown>,
  context: SchemaContext,
  members: string[],
  count: number,
): void {
  const additional = schema.additionalProperties;
  if (additional !== undefined && additional !== false) {
    const type = additional === true ? "unknown" : toType(additional, context);
    members.push(`[key: string]: ${type};`);
  } else if (additional === undefined && count === 0) {
    members.push("[key: string]: unknown;");
  }
}
