import { type KeybindingsManager, type Theme, type Skill } from "@earendil-works/pi-coding-agent";
import { getKeybindings, visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import { defaultConfig, type SkillManagerConfig } from "../src/config.ts";
import { SkillManager } from "../src/ui.ts";
import { skill } from "./fixtures.ts";

function picker(
  config: SkillManagerConfig = defaultConfig(),
  locked = false,
  skills: Skill[] = [skill("one"), skill("two")],
  keybindings: Pick<KeybindingsManager, "matches"> = getKeybindings(),
  savedConfig = config,
) {
  const done = vi.fn();
  const requestRender = vi.fn();
  const fg = vi.fn<Theme["fg"]>((_color, text) => text);
  const theme: Pick<Theme, "fg" | "bold" | "underline"> = {
    fg,
    bold: (text) => text,
    underline: (text) => `\u001b[4m${text}\u001b[24m`,
  };
  const component = new SkillManager(config, skills, locked, theme, keybindings, requestRender, done, savedConfig);
  return { component, done, requestRender, fg };
}

function actions(component: SkillManager): void {
  component.handleInput("\t");
  component.handleInput("\t");
}

function down(component: SkillManager, count: number): void {
  for (let index = 0; index < count; index++) component.handleInput("\u001b[B");
}

describe("skill manager picker", () => {
  it.each([
    { name: "Tab", key: "\t", headings: ["Not loaded (0)", "Actions", "Skills (2)"] },
    { name: "Right", key: "\u001b[C", headings: ["Not loaded (0)", "Actions", "Skills (2)"] },
    { name: "Shift+Tab", key: "\u001b[Z", headings: ["Actions", "Not loaded (0)", "Skills (2)"] },
    { name: "Left", key: "\u001b[D", headings: ["Actions", "Not loaded (0)", "Skills (2)"] },
  ])("switches sections and wraps with $name", ({ key, headings }) => {
    // Arrange
    const { component, done } = picker();

    // Act / Assert
    for (const heading of headings) {
      component.handleInput(key);
      expect(component.render(80).join("\n")).toContain(`\u001b[4m${heading}\u001b[24m`);
    }
    expect(done).not.toHaveBeenCalled();
  });

  it("colors on with success and off with error for loaded and not-loaded skills", () => {
    // Arrange
    const { component, fg } = picker({
      enabled: true,
      skills: [
        ["one", false],
        ["missing-on", true],
        ["missing-off", false],
      ],
    });

    // Act
    const loaded = component.render(80).join("\n");
    component.handleInput("\t");
    const missing = component.render(80).join("\n");

    // Assert
    expect(loaded).toContain("[off] one");
    expect(loaded).toContain("[on] two");
    expect(missing).toContain("[on] missing-on");
    expect(missing).toContain("[off] missing-off");
    expect(fg).toHaveBeenCalledWith("success", "on");
    expect(fg).toHaveBeenCalledWith("error", "off");
  });

  it("refreshes status colors after toggling and theme invalidation", () => {
    // Arrange
    const { component, fg } = picker();
    fg.mockClear();

    // Act
    component.handleInput("\r");
    expect(fg).toHaveBeenCalledWith("error", "off");
    fg.mockClear();
    component.invalidate();

    // Assert
    expect(fg).toHaveBeenCalledWith("success", "on");
    expect(fg).toHaveBeenCalledWith("error", "off");
    expect(component.render(80).join("\n")).toContain("[off] one");
  });

  it("marks changed rules as not saved and clears the marker when reverted", () => {
    // Arrange
    const { component, fg } = picker();
    const initial = component.render(80).join("\n");

    // Act
    component.handleInput("\r");
    const pending = component.render(80).join("\n");
    component.handleInput("\r");
    const reverted = component.render(80).join("\n");

    // Assert
    expect(initial).not.toContain("Changes stay pending");
    expect(initial).not.toContain("(not saved)");
    expect(pending).toContain("[off] one (not saved)");
    expect(fg).toHaveBeenCalledWith("error", "(not saved)");
    expect(reverted).not.toContain("(not saved)");
  });

  it("marks session-only rules relative to the effective saved config", () => {
    // Arrange
    const config = { enabled: true, skills: [["one", false] as [string, boolean]] };
    const sessionOnly = picker(config, false, [skill("one")], getKeybindings(), defaultConfig());
    const saved = picker(config, false, [skill("one")], getKeybindings(), config);

    // Act / Assert
    expect(sessionOnly.component.render(80).join("\n")).toContain("one (not saved)");
    expect(saved.component.render(80).join("\n")).not.toContain("(not saved)");
  });

  it("keeps the unsaved marker visible after long skill names are shortened", () => {
    // Arrange
    const { component } = picker(defaultConfig(), false, [skill("a-very-long-skill-name-with-many-characters")]);

    // Act
    component.handleInput("\r");
    const lines = component.render(80);

    // Assert
    expect(lines.join("\n")).toContain("(not saved)");
    expect(lines.every((line) => visibleWidth(line) <= 80)).toBe(true);
  });

  it("restores the selection highlight after status and unsaved-marker foreground resets", () => {
    // Arrange
    const { component, fg } = picker();
    const colors: Partial<Record<Parameters<Theme["fg"]>[0], string>> = {
      accent: "\u001b[36m",
      success: "\u001b[32m",
      error: "\u001b[31m",
    };
    fg.mockImplementation((color, text) => (colors[color] ? `${colors[color]}${text}\u001b[39m` : text));
    component.invalidate();

    // Act
    component.handleInput("\r");
    const row = component.render(100).find((line) => line.includes("Instructions for one"));

    // Assert
    expect(row).toBeDefined();
    expect(row).toContain("\u001b[31moff\u001b[39m\u001b[36m] one");
    expect(row).toContain("\u001b[31m(not saved)\u001b[39m\u001b[36m");
    if (!row) throw new Error("Missing selected skill row");
    const beforeDescription = row.slice(0, row.indexOf("Instructions for one"));
    expect(beforeDescription.lastIndexOf("\u001b[36m")).toBeGreaterThan(beforeDescription.lastIndexOf("\u001b[39m"));
  });

  it("restores the selection color after combined dim and foreground resets", () => {
    // Arrange
    const { component, fg } = picker();
    fg.mockImplementation((color, text) => {
      if (color === "accent") return `\u001b[36m${text}\u001b[39m`;
      if (color === "success") return `\u001b[32m\u001b[2m${text}\u001b[22;39m`;
      return text;
    });
    component.invalidate();

    // Act
    const row = component.render(100).find((line) => line.includes("Instructions for one"));

    // Assert
    expect(row).toContain("on\u001b[22m\u001b[39m\u001b[36m] one");
  });

  it("underlines only the active tab without duplicating its label above the list", () => {
    // Arrange
    const { component } = picker();

    // Act
    const rendered = component.render(80).join("\n");

    // Assert
    expect(rendered).toContain("\u001b[4mSkills (2)\u001b[24m | Not loaded (0) | Actions");
    expect(rendered.match(/Skills \(2\)/g)).toHaveLength(1);
    expect(rendered.split("\u001b[4m")).toHaveLength(2);
    expect(rendered).not.toContain("> Skills");
  });

  it.each([
    { locked: false, tabs: 0 },
    { locked: false, tabs: 1 },
    { locked: false, tabs: 2 },
    { locked: true, tabs: 0 },
    { locked: true, tabs: 1 },
    { locked: true, tabs: 2 },
  ])("saves the full pending draft with Ctrl+S (locked=$locked, section=$tabs)", ({ locked, tabs }) => {
    // Arrange
    const { component, done } = picker(defaultConfig(), locked);
    component.handleInput("\r");
    for (let index = 0; index < tabs; index++) component.handleInput("\t");

    // Act
    component.handleInput("\u0013");

    // Assert
    expect(done).toHaveBeenCalledExactlyOnceWith({
      action: "save",
      config: { enabled: true, skills: [["one", false]] },
    });
  });

  it("keeps toggles pending and discards them on Escape", () => {
    // Arrange
    const config = defaultConfig();
    const { component, done, requestRender } = picker(config);

    // Act
    component.handleInput("\r");
    expect(component.render(80).join("\n")).toContain("[off] one");
    component.handleInput("\u001b");

    // Assert
    expect(done).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(config).toEqual(defaultConfig());
    expect(requestRender).toHaveBeenCalled();
  });

  it("applies the full draft, including skills outside the search filter", () => {
    // Arrange
    const { component, done } = picker();
    component.handleInput("o");
    component.handleInput("n");
    component.handleInput("e");
    actions(component);
    down(component, 2);

    // Act
    component.handleInput("\r");
    down(component, 2);
    component.handleInput("\r");

    // Assert
    expect(done).toHaveBeenCalledExactlyOnceWith({
      action: "session",
      config: {
        enabled: true,
        skills: [
          ["one", false],
          ["two", false],
        ],
      },
    });
  });

  it("removes a not-loaded rule without changing loaded rules", () => {
    // Arrange
    const { component, done } = picker({
      enabled: true,
      skills: [
        ["one", false],
        ["gone", false],
      ],
    });
    component.handleInput("\t");
    expect(component.render(80).join("\n")).toContain("[off] gone");

    // Act
    component.handleInput("\r");
    component.handleInput("\t");
    down(component, 4);
    component.handleInput("\r");

    // Assert
    expect(done).toHaveBeenCalledWith({ action: "session", config: { enabled: true, skills: [["one", false]] } });
  });

  it("does not offer session application when locked, but still permits saving", () => {
    // Arrange
    const { component, done } = picker(defaultConfig(), true);
    actions(component);
    const rendered = component.render(80).join("\n");

    // Act
    down(component, 4);
    component.handleInput("\r");

    // Assert
    expect(rendered).toContain("Session locked");
    expect(rendered).not.toContain("Apply for this session");
    expect(done).toHaveBeenCalledWith({ action: "project", config: defaultConfig() });
  });

  it("can disable the extension and save globally", () => {
    // Arrange
    const { component, done } = picker();
    actions(component);

    // Act
    component.handleInput("\r");
    down(component, 6);
    component.handleInput("\r");

    // Assert
    expect(done).toHaveBeenCalledWith({ action: "global", config: { enabled: false, skills: [] } });
  });

  it("uses the injected navigation bindings instead of a separate TUI global registry", () => {
    // Arrange
    const keybindings: Pick<KeybindingsManager, "matches"> = {
      matches: (data, action) =>
        (action === "tui.select.down" && data === "j") || getKeybindings().matches(data, action),
    };
    const { component } = picker(defaultConfig(), false, [skill("one"), skill("two")], keybindings);

    // Act
    component.handleInput("j");
    component.handleInput("\r");

    // Assert
    const rendered = component.render(80).join("\n");
    expect(rendered).toContain("[on] one");
    expect(rendered).toContain("[off] two");
  });

  it("renders manual-only skills and empty sections", () => {
    // Arrange
    const { component } = picker(defaultConfig(), false, [skill("manual", true)]);

    // Act / Assert
    expect(component.render(80).join("\n")).toContain("Manual-only");
    component.handleInput("\t");
    expect(component.render(80).join("\n")).toContain("Not loaded (0)");
    expect(component.render(80).join("\n")).toContain("No matches");
  });

  it.each([12, 30, 80])("fits terminal width %s with wide names and propagates focus", (width) => {
    // Arrange
    const { component } = picker(defaultConfig(), false, [skill("long-\u754c-name".repeat(8))]);
    component.focused = true;

    // Act
    component.invalidate();
    const lines = component.render(width);

    // Assert
    expect(component.focused).toBe(true);
    expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
  });
});
