import type { KeybindingsManager, Skill, Theme } from "@earendil-works/pi-coding-agent";
import {
  fuzzyFilter,
  Input,
  Key,
  matchesKey,
  SelectList,
  Text,
  truncateToWidth,
  visibleWidth,
  type Focusable,
  type SelectItem,
  type SelectListTheme,
  type SelectListLayoutOptions,
} from "@earendil-works/pi-tui";
import type { SkillManagerConfig } from "./config.ts";
import { SkillDraft } from "./selection.ts";

export interface ManagerResult {
  action: "session" | "project" | "global" | "save";
  config: SkillManagerConfig;
}

type Section = "skills" | "missing" | "actions";

export class SkillManager implements Focusable {
  private readonly search = new Input({ placeholder: "Search skills..." });
  private readonly draft: SkillDraft;
  private section: Section = "skills";
  private lists: Record<Section, SelectList>;
  private items: Record<Section, SelectItem[]>;
  private readonly skills: Skill[];
  private readonly locked: boolean;
  private readonly theme: Pick<Theme, "fg" | "bold" | "underline">;
  private readonly keybindings: Pick<KeybindingsManager, "matches">;
  private readonly requestRender: () => void;
  private readonly done: (result: ManagerResult | undefined) => void;

  get focused(): boolean {
    return this.search.focused;
  }

  set focused(value: boolean) {
    this.search.focused = value;
  }

  constructor(
    config: SkillManagerConfig,
    skills: Skill[],
    locked: boolean,
    theme: Pick<Theme, "fg" | "bold" | "underline">,
    keybindings: Pick<KeybindingsManager, "matches">,
    requestRender: () => void,
    done: (result: ManagerResult | undefined) => void,
    savedConfig = config,
  ) {
    this.skills = skills;
    this.locked = locked;
    this.theme = theme;
    this.keybindings = keybindings;
    this.requestRender = requestRender;
    this.done = done;
    this.draft = new SkillDraft(config, skills, savedConfig);
    this.items = this.buildItems();
    this.lists = this.buildLists();
  }

  private list(items: SelectItem[], height: number, section: Section): SelectList {
    const listTheme: SelectListTheme = {
      selectedPrefix: (text) => this.theme.fg("accent", text),
      selectedText: (text) => this.highlight(text),
      description: (text) => this.theme.fg("muted", text),
      scrollInfo: (text) => this.theme.fg("dim", text),
      noMatch: () => this.theme.fg("dim", "No matches"),
    };
    const layout: SelectListLayoutOptions =
      section === "actions"
        ? {}
        : {
            truncatePrimary: ({ item, maxWidth }) => this.skillLabel(item.value, maxWidth),
          };
    const list = new SelectList(items, height, listTheme, layout);
    list.onSelect = (item) => this.select(item.value);
    list.onCancel = () => this.done(undefined);
    return list;
  }

  private highlight(text: string): string {
    // Nested status colors reset the foreground; restore the selection color after each one.
    const normalized = text
      .replaceAll("\u001b[22;39m", "\u001b[22m\u001b[39m")
      .replaceAll("\u001b[0m", "\u001b[0m\u001b[39m");
    return normalized
      .split("\u001b[39m")
      .map((part) => this.theme.fg("accent", part))
      .join("");
  }

  private skillLabel(name: string, width?: number): string {
    const enabled = this.draft.allows(name);
    const status = this.theme.fg(enabled ? "success" : "error", enabled ? "on" : "off");
    const label = `[${status}] ${name}`;
    const suffix = this.draft.isUnsaved(name) ? ` ${this.theme.fg("error", "(not saved)")}` : "";
    if (width === undefined) return label + suffix;
    const suffixWidth = visibleWidth(suffix);
    if (width > suffixWidth + 6) return truncateToWidth(label, width - suffixWidth, "") + suffix;
    return truncateToWidth(label + suffix, width, "");
  }

  private loadedItems(): SelectItem[] {
    const query = this.search.getValue();
    const filtered = fuzzyFilter(this.skills, query, (skill) => `${skill.name} ${skill.description}`);
    return filtered.map((skill) => ({
      value: skill.name,
      label: this.skillLabel(skill.name),
      description: skill.disableModelInvocation ? "Manual-only (skill frontmatter)" : skill.description,
    }));
  }

  private missingItems(): SelectItem[] {
    const missing = fuzzyFilter(this.draft.missing(), this.search.getValue(), (name) => name);
    return missing.map((name) => ({
      value: name,
      label: this.skillLabel(name),
      description: "Enter: remove rule",
    }));
  }

  private actionItems(): SelectItem[] {
    const items = [
      { value: "extension", label: `Extension: ${this.draft.enabled ? "enabled" : "disabled"}` },
      { value: "enable-all", label: "Enable all loaded skills" },
      { value: "disable-all", label: "Disable all loaded skills" },
      { value: "remove-missing", label: "Remove all not-loaded rules" },
    ];
    if (!this.locked) items.push({ value: "session", label: "Apply for this session" });
    items.push(
      { value: "project", label: "Save to project" },
      { value: "global", label: "Save globally" },
      { value: "cancel", label: "Cancel" },
    );
    return items;
  }

  private buildItems(): Record<Section, SelectItem[]> {
    return { skills: this.loadedItems(), missing: this.missingItems(), actions: this.actionItems() };
  }

  private buildLists(): Record<Section, SelectList> {
    return {
      skills: this.list(this.items.skills, 8, "skills"),
      missing: this.list(this.items.missing, 4, "missing"),
      actions: this.list(this.items.actions, 8, "actions"),
    };
  }

  private rebuild(): void {
    const previous = this.lists;
    this.items = this.buildItems();
    this.lists = this.buildLists();
    for (const section of ["skills", "missing", "actions"] as const) {
      const value = previous[section].getSelectedItem()?.value;
      const index = this.items[section].findIndex((item) => item.value === value);
      if (index >= 0) this.lists[section].setSelectedIndex(index);
    }
  }

  private select(value: string): void {
    if (this.section === "skills") this.draft.toggle(value);
    else if (this.section === "missing") this.draft.remove(value);
    else this.action(value);
    this.rebuild();
  }

  private action(value: string): void {
    switch (value) {
      case "extension":
        this.draft.enabled = !this.draft.enabled;
        break;
      case "enable-all":
        this.draft.setAll(true);
        break;
      case "disable-all":
        this.draft.setAll(false);
        break;
      case "remove-missing":
        this.draft.removeMissing();
        break;
      case "session":
      case "project":
      case "global":
        this.done({ action: value, config: this.draft.config() });
        break;
      case "cancel":
        this.done(undefined);
        break;
    }
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.ctrl("s"))) {
      this.done({ action: "save", config: this.draft.config() });
    } else if (!this.switchSection(data) && !this.handleNavigation(data)) {
      this.search.handleInput(data);
      this.rebuild();
    }
    this.requestRender();
  }

  private switchSection(data: string): boolean {
    const movements = [
      [Key.tab, "forward"],
      [Key.right, "forward"],
      [Key.shift("tab"), "backward"],
      [Key.left, "backward"],
    ] as const;
    const movement = movements.find(([key]) => matchesKey(data, key));
    if (!movement) return false;
    const directions = {
      forward: { skills: "missing", missing: "actions", actions: "skills" },
      backward: { skills: "actions", missing: "skills", actions: "missing" },
    } as const;
    this.section = directions[movement[1]][this.section];
    return true;
  }

  private handleNavigation(data: string): boolean {
    if (this.keybindings.matches(data, "tui.select.cancel")) {
      this.done(undefined);
      return true;
    }
    if (this.keybindings.matches(data, "tui.select.confirm")) {
      const item = this.lists[this.section].getSelectedItem();
      if (item) this.select(item.value);
      return true;
    }
    const movements = [
      ["tui.select.up", -1],
      ["tui.select.down", 1],
      ["tui.select.pageUp", -8],
      ["tui.select.pageDown", 8],
    ] as const;
    const movement = movements.find(([action]) => this.keybindings.matches(data, action));
    if (!movement) return false;
    this.moveSelection(movement[1]);
    return true;
  }

  private moveSelection(step: number): void {
    const items = this.items[this.section];
    if (items.length === 0) return;
    const selected = this.lists[this.section].getSelectedItem()?.value;
    const index = items.findIndex((item) => item.value === selected);
    const next =
      Math.abs(step) === 1
        ? (index + step + items.length) % items.length
        : Math.max(0, Math.min(items.length - 1, index + step));
    this.lists[this.section].setSelectedIndex(next);
  }

  private text(text: string, width: number): string[] {
    return new Text(text, 0, 0).render(width);
  }

  private tab(section: Section, label: string): string {
    if (section === this.section) return this.theme.fg("accent", this.theme.underline(label));
    return this.theme.fg("muted", label);
  }

  render(width: number): string[] {
    const notice = this.locked
      ? this.text(this.theme.fg("warning", "Session locked: rule changes will apply to future sessions only."), width)
      : [];
    const labels = {
      skills: `Skills (${this.skills.length})`,
      missing: `Not loaded (${this.draft.missing().length})`,
      actions: "Actions",
    };
    const tabs = ["skills", "missing", "actions"] as const;
    const tabRow = tabs.map((section) => this.tab(section, labels[section])).join(" | ");
    return [
      ...this.text(this.theme.bold("Skill manager"), width),
      ...notice,
      ...this.text("Left/Right or Tab/Shift+Tab: switch section | Up/Down: select", width),
      ...this.text("Enter: toggle/action | Ctrl+S: save config | Esc: cancel", width),
      "",
      ...this.search.render(width),
      "",
      ...this.text(tabRow, width),
      ...this.lists[this.section].render(width),
    ];
  }

  invalidate(): void {
    this.search.invalidate();
    this.rebuild();
  }
}
