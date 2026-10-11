import { describe, expect, it } from "vitest";
import { Bm25Ranker, type ToolSearchDocument } from "#src/search";

const documents: ToolSearchDocument[] = [
  { name: "short", text: "search issue" },
  { name: "long", text: "search issue repository project comments labels" },
  { name: "repeated", text: "search search search issue" },
  { name: "unrelated", text: "weather forecast" },
];

describe("tool search ranking", () => {
  it.each([
    { name: "default", options: {}, scores: [0.8808222390070526, 0.8650069506545637, 0.5520396117242693] },
    { name: "custom", options: { k1: 2, b: 0 }, scores: [0.9986898430284508, 0.7133498878774648, 0.7133498878774648] },
  ])("preserves scores with $name parameters", ({ options, scores }) => {
    // Arrange
    const ranker = new Bm25Ranker(options);

    // Act
    const matches = ranker.rank("search for the issues", documents, 10);

    // Assert
    expect(matches.map((match) => match.name)).toEqual(["repeated", "short", "long"]);
    for (const [index, score] of scores.entries()) {
      expect(matches[index]).toHaveProperty("score", expect.closeTo(score, 12));
    }
  });

  it("does not give repeated query terms extra weight", () => {
    // Arrange
    const ranker = new Bm25Ranker();

    // Act
    const single = ranker.rank("search issue", documents, 10);
    const repeated = ranker.rank("search search issues issue", documents, 10);

    // Assert
    expect(repeated).toEqual(single);
  });

  it("keeps document order for ties and applies the result limit", () => {
    // Arrange
    const ranker = new Bm25Ranker();
    const tied = [
      { name: "zeta", text: "search" },
      { name: "alpha", text: "search" },
      { name: "unrelated", text: "weather" },
    ];

    // Act
    const matches = ranker.rank("search", tied, 10);
    const limited = ranker.rank("search", tied, 1);

    // Assert
    expect(matches.map((match) => match.name)).toEqual(["zeta", "alpha"]);
    expect(limited).toEqual(matches.slice(0, 1));
  });

  it.each(["", "the and for", "unmatched"])("returns no matches for query %j", (query) => {
    // Arrange
    const ranker = new Bm25Ranker();

    // Act
    const matches = ranker.rank(query, documents, 10);

    // Assert
    expect(matches).toEqual([]);
  });

  it.each([0, -1])("returns no matches for limit %s", (limit) => {
    // Arrange
    const ranker = new Bm25Ranker();

    // Act
    const matches = ranker.rank("search", documents, limit);

    // Assert
    expect(matches).toEqual([]);
  });

  it.each<{ name: string; documents: ToolSearchDocument[] }>([
    { name: "an empty collection", documents: [] },
    { name: "documents with only stop words", documents: [{ name: "empty", text: "the and for" }] },
  ])("handles $name", ({ documents: emptyDocuments }) => {
    // Arrange
    const ranker = new Bm25Ranker();

    // Act
    const matches = ranker.rank("search", emptyDocuments, 10);

    // Assert
    expect(matches).toEqual([]);
  });

  it("splits identifiers and normalizes case and plurals", () => {
    // Arrange
    const ranker = new Bm25Ranker();
    const identifiers = [{ name: "tool", text: "HTTPServer_fetchIssues" }];

    // Act
    const matches = ranker.rank("http server fetch issue", identifiers, 1);

    // Assert
    expect(matches.map((match) => match.name)).toEqual(["tool"]);
  });
});
