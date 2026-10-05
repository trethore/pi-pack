import { DynamicBorder, getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { Container, Markdown } from "@earendil-works/pi-tui";
import { dedent } from "@pi-pack/shared/dedent";
import { featureDecision, type RequestModel } from "#src/request/compatibility";
import { extensionName, type Destination } from "#src/constants";
import {
  resolveSettings,
  Setting,
  settingNames,
  type EffectiveSettings,
  type Layers,
  type Settings,
} from "#src/config/settings";
import {
  automaticScope,
  matchesScope,
  scopeId,
  scopeLabel,
  scopeRank,
  scopeRules,
  type Selector,
} from "#src/config/scopes";
import type { Changes, SaveReceipt } from "#src/config/changes";

const supportWarning =
  "Request behavior describes intended overrides, not server acceptance. Unverified support can be attempted with allowUnsupported.";

function inlineCode(text: string): string {
  return `\`${text.replace(/[\p{Cc}`|\\]/gu, "?")}\``;
}

function behavior(key: Setting, effective: EffectiveSettings, model: RequestModel | undefined): string {
  const { values } = effective;
  if (key === Setting.ENABLED) {
    return values.enabled ? "Active" : "No request overrides";
  }
  if (key === Setting.ALLOW_UNSUPPORTED) {
    return values.allowUnsupported ? "Support checks bypassed" : "Compatibility checks enabled";
  }
  return featureDecision(key, values, model).description;
}

interface ScopeView {
  match: Selector;
  active: boolean;
  settings: Partial<Settings>;
  sources: Partial<Record<Setting, string>>;
  saved: SaveReceipt[];
}

function scopeViews(layers: Layers, changes: Changes): ScopeView[] {
  const views = new Map<string, ScopeView>();
  function view(match: Selector): ScopeView {
    const id = scopeId(match);
    let result = views.get(id);
    if (!result) {
      result = { match, active: false, settings: {}, sources: {}, saved: [] };
      views.set(id, result);
    }
    return result;
  }
  for (const source of ["global", "project", "environment", "command"] as const) {
    for (const rule of scopeRules(layers[source])) {
      const current = view(rule.match);
      current.active = true;
      Object.assign(current.settings, rule.settings);
      for (const key of settingNames.filter((setting) => Object.hasOwn(rule.settings, setting))) {
        current.sources[key] = source;
      }
    }
  }
  for (const receipt of changes.receipts) {
    view(receipt.match).saved.push(receipt);
  }
  return [...views.values()].sort(
    (left, right) =>
      scopeRank(left.match) - scopeRank(right.match) || scopeId(left.match).localeCompare(scopeId(right.match)),
  );
}

function scopeSource(view: ScopeView, key: Setting, changes: Changes): string {
  if (view.sources[key] !== "command") {
    return view.sources[key] ?? "";
  }
  const pending = changes.pending.some(
    (rule) => scopeId(rule.match) === scopeId(view.match) && Object.hasOwn(rule.settings, key),
  );
  return pending ? "command, unsaved" : "command, saved";
}

function scopeTable(
  view: ScopeView,
  changes: Changes,
  model: RequestModel | undefined,
  target: Selector | undefined,
): string {
  const label = scopeLabel(view.match);
  const heading = label === "All models" ? label : inlineCode(label);
  const markers = view.active
    ? [matchesScope(view.match, model) ? "Matches selected model" : "Does not match selected model"]
    : ["Saved only; not loaded"];
  if (target && view.active && scopeId(view.match) === scopeId(target)) {
    markers.push("Default command target");
  }
  const keys = settingNames.filter((key) => Object.hasOwn(view.settings, key));
  const lines = [`### ${heading}`, "", markers.join(". ") + ".", ""];
  if (keys.length > 0) {
    lines.push(
      "| Setting | Value | Source |",
      "| --- | --- | --- |",
      ...keys.map(
        (key) => `| ${key} | ${inlineCode(String(view.settings[key]))} | ${scopeSource(view, key, changes)} |`,
      ),
    );
  } else {
    lines.push("No explicit active settings.");
  }
  for (const receipt of view.saved) {
    lines.push(
      "",
      `Saved to **${receipt.destination}** for next session/reload (not loaded):`,
      "",
      "| Setting | Saved value |",
      "| --- | --- |",
      ...settingNames
        .filter((key) => Object.hasOwn(receipt.settings, key))
        .map((key) => `| ${key} | ${inlineCode(String(receipt.settings[key]))} |`),
    );
  }
  return lines.join("\n");
}

export function statusMarkdown(
  layers: Layers,
  model: RequestModel | undefined,
  destination: Destination,
  changes: Changes = { pending: [], receipts: [] },
): string {
  const effective = resolveSettings(layers, model);
  const target = automaticScope(layers, model);
  const identity = model ? `${inlineCode(model.provider)} / ${inlineCode(model.id)}` : "None";
  const lines = [
    dedent(`
      ---

      ### ${extensionName}

      Model: ${identity}${"  "}
      API: ${model ? inlineCode(model.api) : "None"}

      Default command target: ${target ? inlineCode(scopeLabel(target)) : "Unavailable; use --scope all"}.
      Save destination: **${destination}**. Saves pending edits at their original scopes unless --scope retargets the write.
      Saving changes files for future sessions/reloads only; active settings stay unchanged.
    `),
    "",
    ...scopeViews(layers, changes).map((view) => scopeTable(view, changes, model, target) + "\n"),
    "### Effective settings",
    "",
    "| Setting | Value | Source | Request behavior | Source scope |",
    "| --- | --- | --- | --- | --- |",
    ...settingNames.map(
      (key) =>
        `| ${key} | ${inlineCode(String(effective.values[key]))} | ${effective.sources[key]} | ${behavior(key, effective, model)} | ${inlineCode(scopeLabel(effective.scopes[key]))} |`,
    ),
    "",
    `Pending save groups: ${changes.pending.length}.`,
    "",
    supportWarning,
    "",
    "---",
  ];
  return lines.join("\n");
}

export function renderStatus(markdown: string, theme: Theme): Container {
  const markdownTheme = getMarkdownTheme();
  const content = markdown
    .replace(/^---\n\n/, "")
    .replace(/\n\n---$/, "")
    .replace(supportWarning, theme.fg("warning", supportWarning));
  const container = new Container();
  container.addChild(new DynamicBorder((text) => theme.fg("border", text)));
  container.addChild(
    new Markdown(content, 1, 1, {
      ...markdownTheme,
      code(text) {
        if (text === "true") {
          return theme.fg("success", text);
        }
        if (text === "false" || text === "null") {
          return theme.fg("error", text);
        }
        return markdownTheme.code(text);
      },
    }),
  );
  container.addChild(new DynamicBorder((text) => theme.fg("border", text)));
  return container;
}
