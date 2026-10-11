import { isRecord } from "#src/sandbox/values";
import type { ToolInfo, ToolNamespace } from "@earendil-works/pi-coding-agent";

/** A tool as the ranker sees it: its name and the text built by {@link createToolSearchDocument}. */
export interface ToolSearchDocument {
  name: string;
  text: string;
}

export interface ToolSearchMatch {
  name: string;
  score: number;
}

/** Ranks tools for a query. BM25 today; a hybrid ranker with embeddings can replace it. */
interface ToolRanker {
  rank(query: string, documents: readonly ToolSearchDocument[], limit: number): ToolSearchMatch[];
}

const STOP_WORDS: ReadonlySet<string> = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "with",
]);

/** Naive singular form, so `issues` matches `issue` and `searches` matches `search`. */
function stem(term: string): string {
  if (term.length > 4 && term.endsWith("ies")) {
    return `${term.slice(0, -3)}y`;
  }
  if (term.length > 4 && /(ches|shes|sses|xes|zes)$/.test(term)) {
    return term.slice(0, -2);
  }
  if (term.length > 3 && term.endsWith("s") && !term.endsWith("ss")) {
    return term.slice(0, -1);
  }
  return term;
}

/** Lowercase terms, split at camelCase boundaries and non-alphanumerics, without stop words. */
function tokenize(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 0 && !STOP_WORDS.has(term))
    .map(stem);
}

/** Schema descriptions and property names, recursively. */
function schemaText(schema: unknown, parts: string[]): void {
  if (!isRecord(schema)) {
    return;
  }

  if (typeof schema.description === "string") {
    parts.push(schema.description);
  }

  if (isRecord(schema.properties)) {
    for (const [name, property] of Object.entries(schema.properties)) {
      parts.push(name);
      schemaText(property, parts);
    }
  }

  schemaText(schema.items, parts);

  for (const key of ["anyOf", "oneOf", "allOf"]) {
    const variants = schema[key];
    if (Array.isArray(variants)) {
      for (const variant of variants) {
        schemaText(variant, parts);
      }
    }
  }
}

/**
 * Search text of a tool: the name, the name with `_`
 * as spaces, the description, schema descriptions and property names, and the namespace with its
 * description and instructions.
 */
export function createToolSearchDocument(
  tool: Pick<ToolInfo, "name" | "description" | "parameters">,
  namespace?: ToolNamespace,
): ToolSearchDocument {
  const parts = [tool.name, tool.name.replaceAll("_", " "), tool.description];
  schemaText(tool.parameters, parts);

  if (namespace) {
    parts.push(namespace.name, namespace.description ?? "", namespace.instructions ?? "");
  }

  return { name: tool.name, text: parts.filter((part) => part.trim()).join(" ") };
}

interface AnalyzedDocument {
  name: string;
  termCounts: ReadonlyMap<string, number>;
  length: number;
}

function analyzeDocument(document: ToolSearchDocument): AnalyzedDocument {
  const terms = tokenize(document.text);
  const termCounts = new Map<string, number>();

  for (const term of terms) {
    termCounts.set(term, (termCounts.get(term) ?? 0) + 1);
  }

  return { name: document.name, termCounts, length: terms.length };
}

function calculateTermWeights(
  queryTerms: readonly string[],
  documents: readonly AnalyzedDocument[],
): Map<string, number> {
  const weights = new Map<string, number>();

  for (const term of queryTerms) {
    const frequency = documents.filter((document) => document.termCounts.has(term)).length;
    const weight = Math.log(1 + (documents.length - frequency + 0.5) / (frequency + 0.5));
    weights.set(term, weight);
  }

  return weights;
}

/** Okapi BM25 with the usual parameters. Ties keep document order. */
export class Bm25Ranker implements ToolRanker {
  private readonly k1: number;
  private readonly b: number;

  constructor(options: { k1?: number; b?: number } = {}) {
    this.k1 = options.k1 ?? 1.2;
    this.b = options.b ?? 0.75;
  }

  rank(query: string, documents: readonly ToolSearchDocument[], limit: number): ToolSearchMatch[] {
    const queryTerms = [...new Set(tokenize(query))];
    if (queryTerms.length === 0 || documents.length === 0 || limit <= 0) {
      return [];
    }

    const analyzed = documents.map(analyzeDocument);
    const averageLength = analyzed.reduce((sum, document) => sum + document.length, 0) / analyzed.length || 1;
    const termWeights = calculateTermWeights(queryTerms, analyzed);

    const matches: ToolSearchMatch[] = [];
    for (const document of analyzed) {
      const score = this.scoreDocument(document, termWeights, averageLength);
      if (score > 0) {
        matches.push({ name: document.name, score });
      }
    }

    return matches.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  private scoreDocument(
    document: AnalyzedDocument,
    termWeights: ReadonlyMap<string, number>,
    averageLength: number,
  ): number {
    const normalization = this.k1 * (1 - this.b + (this.b * document.length) / averageLength);
    let score = 0;

    for (const [term, weight] of termWeights) {
      const count = document.termCounts.get(term);
      if (!count) {
        continue;
      }
      score += weight * ((count * (this.k1 + 1)) / (count + normalization));
    }

    return score;
  }
}
