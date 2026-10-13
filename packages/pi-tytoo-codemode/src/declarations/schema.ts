import { constraintTags } from "#src/declarations/constraints";
import { encodeJson, isArray, isRecord } from "#src/sandbox/values";
import type { CodemodeJsonSchema } from "#src/sandbox/types";

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const INDENT = "  ";
const MAX_REF_EXPANSIONS = 32;

function propertyKey(name: string): string {
  return IDENTIFIER.test(name) ? name : JSON.stringify(name);
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
 * or one property per line with `//` comments for descriptions and constraint tags; `Array<T>` for
 * arrays. Local references (`#/$defs/...`, `#/definitions/...`) resolve against `schema`;
 * recursive and remote references render as `unknown`. A result longer than `maxChars` is rendered
 * again without constraint tags, then becomes `unknown` if it still exceeds the limit.
 */
export function schemaToType(schema: CodemodeJsonSchema, options: { maxChars?: number } = {}): string {
  const render = (tags: boolean) => toType(schema, { root: schema, resolving: new Set(), expansions: 0, tags });
  const type = render(true);
  if (options.maxChars === undefined || type.length <= options.maxChars) {
    return type;
  }
  const untagged = render(false);
  return untagged.length <= options.maxChars ? untagged : "unknown";
}

interface SchemaContext {
  root: CodemodeJsonSchema;
  /** References being expanded on the current path, to stop at recursive types. */
  resolving: Set<string>;
  expansions: number;
  tags: boolean;
}

function resolveRef(ref: string, root: CodemodeJsonSchema): CodemodeJsonSchema | undefined {
  if (ref !== "#" && !ref.startsWith("#/")) {
    return undefined;
  }

  let current: unknown = root;
  for (const segment of ref.slice(2).split("/").filter(Boolean)) {
    const key = decodeURIComponent(segment).replaceAll("~1", "/").replaceAll("~0", "~");
    if (!isRecord(current) || !(key in current)) {
      return undefined;
    }

    current = current[key];
  }

  return typeof current === "boolean" || isRecord(current) ? current : undefined;
}

function toType(schema: unknown, context: SchemaContext): string {
  if (schema === true) {
    return "unknown";
  }

  if (schema === false) {
    return "never";
  }

  if (!isRecord(schema)) {
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

  return composedType(schema, context) ?? declaredType(schema, context);
}

function composedType(schema: Record<string, unknown>, context: SchemaContext): string | undefined {
  if (isArray(schema.anyOf)) {
    return union(schema.anyOf.map((variant) => toType(variant, context)));
  }

  if (isArray(schema.oneOf)) {
    return union(schema.oneOf.map((variant) => toType(variant, context)));
  }

  if (!isArray(schema.allOf)) {
    return undefined;
  }

  const parts = schema.allOf.map((part) => toType(part, context)).filter((part) => part !== "unknown");
  if (parts.length === 0) {
    return "unknown";
  }

  return parts.map((part) => (part.includes(" | ") ? `(${part})` : part)).join(" & ");
}

function declaredType(schema: Record<string, unknown>, context: SchemaContext): string {
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

  let tuple: unknown[] = [];
  if (isArray(schema.prefixItems)) {
    tuple = schema.prefixItems;
  } else if (isArray(schema.items)) {
    tuple = schema.items;
  }

  if (tuple.length > 0) {
    return `[${tuple.map((item) => toType(item, context)).join(", ")}]`;
  }

  return "unknown[]";
}

function descriptionOf(property: unknown): string {
  return isRecord(property) && typeof property.description === "string" ? property.description.trim() : "";
}

interface ObjectProperty {
  description: string;
  declaration: string;
}

function objectType(schema: Record<string, unknown>, context: SchemaContext): string {
  const properties = objectProperties(schema, context);
  const additional = additionalPropertiesMember(schema, context, properties.length);

  if (properties.some((property) => property.description)) {
    return multilineObjectType(properties, additional);
  }

  const members = properties.map((property) => property.declaration);
  if (additional !== undefined) {
    members.push(additional);
  }

  if (members.length === 0) {
    return "{}";
  }

  return `{ ${members.join(" ")} }`;
}

function objectProperties(schema: Record<string, unknown>, context: SchemaContext): ObjectProperty[] {
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = new Set(isArray(schema.required) ? schema.required : []);
  const names = Object.keys(properties).sort();

  return names.map((name) => {
    const property = properties[name];
    const optional = required.has(name) ? "" : "?";
    const declaration = `${propertyKey(name)}${optional}: ${toType(property, context)};`;

    const tags = context.tags ? constraintTags(property) : "";
    const description = [descriptionOf(property), tags].filter(Boolean).join("\n");
    return { description, declaration };
  });
}

function multilineObjectType(properties: ObjectProperty[], additional: string | undefined): string {
  const lines = ["{"];

  for (const property of properties) {
    for (const line of property.description.split(/[\r\n\u2028\u2029]/)) {
      const description = line.trim();
      if (description) {
        lines.push(`${INDENT}// ${description}`);
      }
    }

    lines.push(`${INDENT}${property.declaration.replaceAll("\n", `\n${INDENT}`)}`);
  }

  if (additional !== undefined) {
    lines.push(`${INDENT}${additional}`);
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

function additionalPropertiesMember(
  schema: Record<string, unknown>,
  context: SchemaContext,
  propertyCount: number,
): string | undefined {
  const additional = schema.additionalProperties;
  if (additional !== undefined && additional !== false) {
    const type = additional === true ? "unknown" : toType(additional, context);
    return `[key: string]: ${type};`;
  }

  if (additional === undefined && propertyCount === 0) {
    return "[key: string]: unknown;";
  }

  return undefined;
}
