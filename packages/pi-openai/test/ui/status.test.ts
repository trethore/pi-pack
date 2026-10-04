import { initTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { beforeAll, expect, it, vi } from "vitest";
import { resolveSettings } from "#src/config/settings";
import { renderStatus, statusMarkdown } from "#src/ui/status";
import { layers, model } from "#test/support";

beforeAll(() => {
  initTheme("dark", false);
});

it("shows a Markdown table with effective values, sources, behavior and save destination", () => {
  // Arrange
  const effective = resolveSettings(
    layers({
      project: { webSearch: true },
      environment: { verbosity: "low" },
      command: { reasoningSummary: "none" },
    }),
  );

  // Act
  const markdown = statusMarkdown(effective, model, "project");

  // Assert
  expect(markdown).toContain("| Setting | Value | Source | Request behavior |");
  expect(markdown).toContain("| verbosity | `low` | environment | Set text.verbosity |");
  expect(markdown).toContain("| reasoningSummary | `none` | command | Remove reasoning.summary |");
  expect(markdown).toContain("| serviceTier | `default` | default | Leave unchanged |");
  expect(markdown).toContain("Model: `openai` / `gpt-6-sol`");
  expect(markdown).toContain("Save destination: **project**");
  expect(markdown).toContain("including environment and command overrides");
  expect(markdown).not.toContain(model.baseUrl);
});

it("surrounds status with horizontal rules and leaves the support warning unquoted", () => {
  // Act
  const markdown = statusMarkdown(resolveSettings(layers()), model, "global");

  // Assert
  expect(markdown.startsWith("---\n\n")).toBe(true);
  expect(markdown.endsWith("\n\n---")).toBe(true);
  expect(markdown).toContain(
    "\nRequest behavior describes intended overrides, not server acceptance. Unverified support can be attempted with allowUnsupported.\n",
  );
});

it("shows disabled settings and missing or unsupported models clearly", () => {
  // Act / Assert
  const disabled = statusMarkdown(resolveSettings(layers({ command: { enabled: false } })), model, "global");
  expect(disabled).toContain("No request overrides");
  expect(disabled).toContain("Disabled: leave unchanged");
  const configured = resolveSettings(layers({ command: { verbosity: "low" } }));
  expect(statusMarkdown(configured, undefined, "global")).toContain("Skipped: no model selected");
  expect(statusMarkdown(configured, { ...model, api: "anthropic-messages" }, "global")).toContain(
    "Skipped: unsupported API format",
  );
});

it("escapes model metadata rather than allowing table or terminal injection", () => {
  // Act
  const markdown = statusMarkdown(resolveSettings(layers()), { ...model, id: "id`|\n\u001b[31m\\text" }, "global");

  // Assert
  expect(markdown).toContain("id????[31m?text");
  expect(markdown).not.toContain("\u001b");
});

it.each([30, 60, 100, 160])(
  "renders within %i columns using green true, red false/null and a yellow warning",
  (width) => {
    // Arrange
    const colors = { success: "32", error: "31", warning: "33", border: "34" };
    const fg = vi.fn((color: keyof typeof colors, text: string) => `\u001b[${colors[color]}m${text}\u001b[0m`);
    const theme = { fg } as unknown as Theme;
    const component = renderStatus(statusMarkdown(resolveSettings(layers()), model, "global"), theme);

    // Act
    const output = component.render(width);
    component.invalidate();

    // Assert
    expect(fg).toHaveBeenCalledWith("success", "true");
    expect(fg).toHaveBeenCalledWith("error", "false");
    expect(fg).toHaveBeenCalledWith("error", "null");
    expect(fg).toHaveBeenCalledWith("warning", expect.stringContaining("Request behavior"));
    const border = `\u001b[34m${"\u2500".repeat(width)}\u001b[0m`;
    expect(output[0]).toBe(border);
    expect(output.at(-1)).toBe(border);
    expect(fg).toHaveBeenCalledWith("border", "\u2500".repeat(width));
    expect(output.every((line) => visibleWidth(line) <= width)).toBe(true);
    expect(output.join("\n")).toContain("\u001b[32m");
    expect(output.join("\n")).toContain("\u001b[33m");
  },
);

it("explains the modern-model support boundary in status", () => {
  // Arrange
  const effective = resolveSettings(
    layers({ command: { verbosity: "low", reasoningSummary: "none", webSearch: true, serviceTier: "priority" } }),
  );

  // Act
  const markdown = statusMarkdown(effective, { ...model, id: "o3" }, "global");

  // Assert
  expect(markdown).toContain("Skipped: Model support is limited to known GPT-5.5 and newer models");
  expect(markdown).not.toContain("Remove reasoning.summary");
});

it.each(["openai-responses", "unknown-api"])("shows payload-dependent behavior for %s with the unsafe flag", (api) => {
  // Arrange
  const effective = resolveSettings(
    layers({
      command: {
        allowUnsupported: true,
        verbosity: "low",
        reasoningSummary: "auto",
        webSearch: true,
        serviceTier: "priority",
      },
    }),
  );

  // Act
  const markdown = statusMarkdown(effective, { ...model, api }, "global");

  // Assert
  for (const setting of ["verbosity", "reasoningSummary", "webSearch", "serviceTier"]) {
    const row = markdown.split("\n").find((line) => line.startsWith(`| ${setting} |`));
    expect(row).toContain("Attempt on compatible request payload (support checks bypassed)");
  }
  expect(markdown).not.toContain("Skipped:");
});

it.each([
  {
    provider: "azure-openai-responses",
    api: "azure-openai-responses",
    baseUrl: "https://example.openai.azure.com",
    id: "gpt-6-sol",
    search: "Add native web search if absent",
    tier: "Set service_tier to priority",
  },
  {
    provider: "azure-openai-responses",
    api: "azure-openai-responses",
    baseUrl: "https://example.openai.azure.com",
    id: "gpt-6.1-sol",
    search: "Add native web search if absent",
    tier: "Skipped: Priority processing support is unverified for this Azure model",
  },
  {
    provider: "github-copilot",
    api: "openai-responses",
    baseUrl: "https://api.githubcopilot.com",
    id: "gpt-6-sol",
    search: "Skipped: Native feature support is unverified on this endpoint",
    tier: "Skipped: Native feature support is unverified on this endpoint",
  },
])("shows provider feature handling for $provider / $id", ({ search, tier, ...identity }) => {
  // Arrange
  const effective = resolveSettings(
    layers({ command: { verbosity: "low", reasoningSummary: "auto", webSearch: true, serviceTier: "priority" } }),
  );

  // Act
  const markdown = statusMarkdown(effective, { ...model, ...identity }, "global");

  // Assert
  expect(markdown).toContain("| verbosity | `low` | command | Set text.verbosity |");
  expect(markdown).toContain("| reasoningSummary | `auto` | command | Set reasoning.summary |");
  expect(markdown).toContain(`| webSearch | \`true\` | command | ${search} |`);
  expect(markdown).toContain(`| serviceTier | \`priority\` | command | ${tier} |`);
});
