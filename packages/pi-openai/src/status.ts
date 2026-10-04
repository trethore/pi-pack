import { getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { Markdown } from "@earendil-works/pi-tui";
import { featureDecision, type RequestModel } from "#src/compatibility";
import { extensionName, type Destination } from "#src/constants";
import { Setting, settingNames, type EffectiveSettings } from "#src/settings";

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
    `### ${extensionName}`,
    "",
    `Model: ${identity}  `,
    `API: ${model ? inlineCode(model.api) : "None"}`,
    "",
    "| Setting | Value | Source | Request behavior |",
    "| --- | --- | --- | --- |",
    ...settingNames.map(
      (key) =>
        `| ${key} | ${inlineCode(String(effective.values[key]))} | ${effective.sources[key]} | ${behavior(key, effective, model)} |`,
    ),
    "",
    `Save destination: **${destination}**. Saves all effective settings, including environment and command overrides.`,
    "",
    "Request behavior describes intended overrides, not server acceptance. Unverified support can be attempted with allowUnsupported.",
  ];
  return lines.join("\n");
}

export function renderStatus(markdown: string, theme: Theme): Markdown {
  const markdownTheme = getMarkdownTheme();
  return new Markdown(markdown, 1, 0, {
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
  });
}
