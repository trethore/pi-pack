import { SessionManager, formatSkillsForPrompt } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.ts";
import { selectionEntryType, SessionSelection, SkillDraft } from "../src/selection.ts";
import { skill } from "./fixtures.ts";

describe("session selection", () => {
  it("filters exact names, allows new skills and respects manual-only frontmatter", () => {
    // Arrange
    const selection = new SessionSelection();
    selection.apply({
      enabled: true,
      skills: [
        ["review", false],
        ["manual", true],
      ],
    });

    // Act
    const filtered = selection.filter([skill("review"), skill("review-new"), skill("manual", true)]);

    // Assert
    expect(filtered.map((item) => item.name)).toEqual(["review-new", "manual"]);
    expect(formatSkillsForPrompt(filtered)).toContain("<name>review-new</name>");
    expect(formatSkillsForPrompt(filtered)).not.toContain("<name>manual</name>");
    expect(selection.locked).toBe(true);
  });

  it("does not filter when the extension is disabled", () => {
    // Arrange
    const selection = new SessionSelection();
    selection.apply({ enabled: false, skills: [["review", false]] });

    // Act / Assert
    expect(selection.filter([skill("review")])).toHaveLength(1);
  });

  it("freezes descriptions, paths, order and skill membership for later runs", () => {
    // Arrange
    const selection = new SessionSelection();
    const original = selection.filter([skill("review"), skill("tests")]);
    const changed = { ...skill("review"), description: "Updated", filePath: "/moved/SKILL.md" };

    // Act
    const next = selection.filter([skill("new"), changed]);

    // Assert
    expect(formatSkillsForPrompt(next)).toBe(formatSkillsForPrompt(original));
    expect(() => selection.apply(defaultConfig())).toThrow("locked");
  });

  it("restores locked selections from all session entries even outside the active branch", () => {
    // Arrange
    const manager = SessionManager.inMemory();
    const selection = new SessionSelection();
    selection.apply({ enabled: true, skills: [["hidden", false]] });
    const original = selection.filter([skill("hidden"), skill("review")]);
    manager.appendCustomEntry(selectionEntryType, selection.snapshot());
    manager.resetLeaf();
    const restored = new SessionSelection();

    // Act
    restored.restore(manager.getEntries(), { enabled: false, skills: [] });

    // Assert
    expect(manager.getBranch()).toEqual([]);
    expect(restored.locked).toBe(true);
    expect(formatSkillsForPrompt(restored.filter([skill("new")]))).toBe(formatSkillsForPrompt(original));
  });

  it("keeps session-only changes across reload before the first run", () => {
    // Arrange
    const manager = SessionManager.inMemory();
    const selection = new SessionSelection();
    selection.apply({ enabled: false, skills: [["hidden", false]] });
    manager.appendCustomEntry(selectionEntryType, selection.snapshot());
    const restored = new SessionSelection();

    // Act
    restored.restore(manager.getEntries(), defaultConfig());

    // Assert
    expect(restored.locked).toBe(false);
    expect(restored.config).toEqual(selection.config);
  });

  it("does not apply new config rules to pre-existing conversations without a snapshot", () => {
    // Arrange
    const manager = SessionManager.inMemory();
    manager.appendMessage({ role: "system", content: "Existing prompt", timestamp: 0 });
    const selection = new SessionSelection();

    // Act
    selection.restore(manager.getEntries(), { enabled: true, skills: [["review", false]] });

    // Assert
    expect(selection.locked).toBe(true);
    expect(selection.filter([skill("review")])).toHaveLength(1);
  });

  it("rejects malformed persisted selections", () => {
    // Arrange
    const manager = SessionManager.inMemory();
    manager.appendCustomEntry(selectionEntryType, { version: 99 });
    const selection = new SessionSelection();

    // Act / Assert
    expect(() => selection.restore(manager.getEntries(), defaultConfig())).toThrow("invalid saved");
  });
});

describe("pending UI draft", () => {
  it("toggles loaded skills without modifying the original config", () => {
    // Arrange
    const config = { enabled: true, skills: [["missing", false] as [string, boolean]] };
    const draft = new SkillDraft(config, [skill("review")]);

    // Act
    draft.toggle("review");
    draft.enabled = false;

    // Assert
    expect(draft.config()).toEqual({
      enabled: false,
      skills: [
        ["missing", false],
        ["review", false],
      ],
    });
    expect(config).toEqual({ enabled: true, skills: [["missing", false]] });
  });

  it("toggles all loaded skills without changing not-loaded rules", () => {
    // Arrange
    const draft = new SkillDraft({ enabled: true, skills: [["missing", false]] }, [skill("one"), skill("two")]);

    // Act
    draft.setAll(false);
    draft.setAll(true);

    // Assert
    expect(draft.config().skills).toEqual([
      ["missing", false],
      ["one", true],
      ["two", true],
    ]);
    expect(draft.missing()).toEqual(["missing"]);
  });

  it("removes only explicit not-loaded rules and matches moved skills by name", () => {
    // Arrange
    const draft = new SkillDraft(
      {
        enabled: true,
        skills: [
          ["review", false],
          ["missing", true],
        ],
      },
      [skill("review")],
    );

    // Act
    draft.removeMissing();

    // Assert
    expect(draft.config().skills).toEqual([["review", false]]);
    expect(draft.missing()).toEqual([]);
  });
});
