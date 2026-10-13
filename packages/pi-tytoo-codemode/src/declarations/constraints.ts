import { isArray, isRecord } from "#src/sandbox/values";

const TAG_KEYWORDS = [
  "minimum",
  "exclusiveMinimum",
  "maximum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "minItems",
  "maxItems",
];
/** Tag keywords whose values all hold at once, so only the largest (lower) or smallest (upper) matters. */
const LOWER_BOUNDS = new Set(["minimum", "exclusiveMinimum", "minLength", "minItems"]);
const UPPER_BOUNDS = new Set(["maximum", "exclusiveMaximum", "maxLength", "maxItems"]);
/** Longest property tag; longer ones (large defaults, long patterns) are left out. */
const MAX_TAG_CHARS = 80;
/** Characters that end a `//` comment. */
const LINE_TERMINATORS = /[\r\n\u2028\u2029]/g;

function normalizeBounds(schema: Record<string, unknown>): Record<string, unknown> {
  return {
    ...schema,
    ...(schema.exclusiveMinimum === true ? { minimum: undefined, exclusiveMinimum: schema.minimum } : {}),
    ...(schema.exclusiveMaximum === true ? { maximum: undefined, exclusiveMaximum: schema.maximum } : {}),
  };
}

function constraintSchemas(property: Record<string, unknown>): Record<string, unknown>[] {
  const variants = isArray(property.anyOf) ? property.anyOf : property.oneOf;
  const nonNull = isArray(variants) ? variants.filter((variant) => !isRecord(variant) || variant.type !== "null") : [];
  const branch = nonNull.length === 1 ? nonNull[0] : undefined;
  const schemas = isRecord(branch) ? [property, branch] : [property];
  return schemas.map(normalizeBounds);
}

function isInteger(type: unknown): boolean {
  return type === "integer" || (isArray(type) && type.includes("integer"));
}

function keywordTags(keyword: string, schemas: Record<string, unknown>[]): string[] {
  const values = schemas.map((schema) => schema[keyword]);
  if (LOWER_BOUNDS.has(keyword) || UPPER_BOUNDS.has(keyword)) {
    const numbers = values.filter((value) => typeof value === "number");
    if (numbers.length === 0) {
      return [];
    }
    const bound = LOWER_BOUNDS.has(keyword) ? Math.max(...numbers) : Math.min(...numbers);
    return [`@${keyword} ${bound}`];
  }
  return [...new Set(values)].flatMap((value) =>
    typeof value === "number" || typeof value === "string" ? [`@${keyword} ${value}`] : [],
  );
}

export function constraintTags(property: unknown): string {
  if (!isRecord(property)) {
    return "";
  }
  const schemas = constraintSchemas(property);
  const tags: string[] = [];
  if (schemas.some((schema) => isInteger(schema.type))) {
    tags.push("@integer");
  }
  tags.push(...TAG_KEYWORDS.flatMap((keyword) => keywordTags(keyword, schemas)));
  if (schemas.some((schema) => schema.uniqueItems === true)) {
    tags.push("@uniqueItems");
  }
  if (property.default !== undefined && property.default !== null) {
    tags.push(`@default ${JSON.stringify(property.default)}`);
  }
  if (property.deprecated === true) {
    tags.push("@deprecated");
  }
  return tags
    .filter((tag) => tag.length <= MAX_TAG_CHARS)
    .map((tag) => tag.replace(LINE_TERMINATORS, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`))
    .join(" ");
}
