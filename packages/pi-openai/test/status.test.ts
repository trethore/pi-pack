import { initTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { beforeAll, expect, it, vi } from "vitest";
import { resolveSettings } from "#src/settings";
import { renderStatus, statusMarkdown } from "#src/status";
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

it.each([30, 60, 100, 160])("renders within %i columns using green true and red false/null", (width) => {
  // Arrange
  const fg = vi.fn((color: string, text: string) => `\u001b[${color === "success" ? "32" : "31"}m${text}\u001b[0m`);
  const theme = { fg } as unknown as Theme;
  const component = renderStatus(statusMarkdown(resolveSettings(layers()), model, "global"), theme);

  // Act
  const output = component.render(width);
  component.invalidate();

  // Assert
  expect(fg).toHaveBeenCalledWith("success", "true");
  expect(fg).toHaveBeenCalledWith("error", "false");
  expect(fg).toHaveBeenCalledWith("error", "null");
  expect(output.every((line) => visibleWidth(line) <= width)).toBe(true);
  expect(output.join("\n")).toContain("\u001b[32m");
});

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
