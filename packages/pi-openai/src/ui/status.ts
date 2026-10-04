import { DynamicBorder, getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { Container, Markdown } from "@earendil-works/pi-tui";
import { dedent } from "@pi-pack/shared/dedent";
import { featureDecision, type RequestModel } from "#src/request/compatibility";
import { extensionName, type Destination } from "#src/constants";
import { Setting, settingNames, type EffectiveSettings } from "#src/config/settings";

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

export function statusMarkdown(
  effective: EffectiveSettings,
  model: RequestModel | undefined,
  destination: Destination,
): string {
  const identity = model ? `${inlineCode(model.provider)} / ${inlineCode(model.id)}` : "None";
  const lines = [
    dedent(`
      ---

      ### ${extensionName}

      Model: ${identity}${"  "}
      API: ${model ? inlineCode(model.api) : "None"}

      | Setting | Value | Source | Request behavior |
      | --- | --- | --- | --- |
    `),
    ...settingNames.map(
      (key) =>
        `| ${key} | ${inlineCode(String(effective.values[key]))} | ${effective.sources[key]} | ${behavior(key, effective, model)} |`,
    ),
    "",
    dedent(`
      Save destination: **${destination}**. Saves all effective settings, including environment and command overrides.

      ${supportWarning}

      ---
    `),
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
