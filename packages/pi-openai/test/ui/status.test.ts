import { initTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { beforeAll, expect, it, vi } from "vitest";
import { Setting } from "#src/config/settings";
import { Verbosity, ReasoningSummary, Destination, ServiceTier } from "#src/constants";
import { renderStatus, statusMarkdown } from "#src/ui/status";
import { completeSave, prepareSave, undoCommand, unsetCommand, setCommand, type Changes } from "#src/config/changes";
import { layers, model } from "#test/support";

beforeAll(() => {
  initTheme("dark", false);
});

it("shows a Markdown table with effective values, sources, behavior and save destination", () => {
  // Arrange
  const effective = layers({
    project: { webSearch: true },
    environment: { verbosity: Verbosity.LOW },
    command: { reasoningSummary: ReasoningSummary.NONE },
  });

  // Act
  const markdown = statusMarkdown(effective, model, Destination.PROJECT);

  // Assert
  expect(markdown).toContain("| Setting | Value | Source | Request behavior |");
  expect(markdown).toContain("| verbosity | `low` | environment | Set text.verbosity |");
  expect(markdown).toContain("| reasoningSummary | `none` | command | Remove reasoning.summary |");
  expect(markdown).toContain("| serviceTier | `default` | default | Leave unchanged |");
  expect(markdown).toContain("Model: `openai` / `gpt-6-sol`");
  expect(markdown).toContain("Default set destination: **project**");
  expect(markdown).toContain("Pending edits keep their recorded sources and scopes");
  expect(markdown).toContain("Unset selects its own target per setting, skipping absent values and pending removals.");
  expect(markdown).toContain("### All models");
  expect(markdown).toContain("## Effective settings");
  expect(markdown).not.toContain(model.baseUrl);
  expect(markdown).not.toContain("Use `/pi-openai save` to save the changes.");
});

it("surrounds status with horizontal rules and leaves the support warning unquoted", () => {
  // Act
  const markdown = statusMarkdown(layers(), model, Destination.GLOBAL);

  // Assert
  expect(markdown.startsWith("---\n\n")).toBe(true);
  expect(markdown.endsWith("\n\n---")).toBe(true);
  expect(markdown).toContain(
    "\nRequest behavior describes intended overrides, not server acceptance. Unverified support can be attempted with allowUnsupported.\n",
  );
});

it("keeps status text unindented and preserves the Markdown model line break", () => {
  // Arrange
  const effective = layers();

  // Act
  const markdown = statusMarkdown(effective, model, Destination.GLOBAL);

  // Assert
  expect(markdown).toContain("Model: `openai` / `gpt-6-sol`  \nAPI: `openai-responses`");
  expect(markdown.split("\n").every((line) => line === line.trimStart())).toBe(true);
});

it("shows disabled settings and missing or unsupported models clearly", () => {
  // Act / Assert
  const disabled = statusMarkdown(layers({ command: { enabled: false } }), model, Destination.GLOBAL);
  expect(disabled).toContain("No request overrides");
  expect(disabled).toContain("Disabled: leave unchanged");
  const configured = layers({ command: { verbosity: Verbosity.LOW } });
  expect(statusMarkdown(configured, undefined, Destination.GLOBAL)).toContain("Skipped: no model selected");
  expect(statusMarkdown(configured, { ...model, api: "anthropic-messages" }, Destination.GLOBAL)).toContain(
    "Skipped: unsupported API format",
  );
});

it("escapes model metadata rather than allowing table or terminal injection", () => {
  // Act
  const markdown = statusMarkdown(layers(), { ...model, id: "id`|\n\u001b[31m\\text" }, Destination.GLOBAL);

  // Assert
  expect(markdown).toContain("id????[31m?text");
  expect(markdown).not.toContain("\u001b");
});

it.each([30, 60, 100, 160])(
  "renders within %i columns using green true, red false/null/Removed and a yellow warning",
  (width) => {
    // Arrange
    const colors = { success: "32", error: "31", warning: "33", border: "34" };
    const fg = vi.fn((color: keyof typeof colors, text: string) => `\u001b[${colors[color]}m${text}\u001b[0m`);
    const theme = { fg } as unknown as Theme;
    const changes: Changes = {
      pending: [{ destination: Destination.GLOBAL, match: {}, settings: {}, unset: [Setting.VERBOSITY] }],
      receipts: [],
    };
    const component = renderStatus(statusMarkdown(layers(), model, Destination.GLOBAL, changes), theme);

    // Act
    const output = component.render(width);
    component.invalidate();

    // Assert
    expect(fg).toHaveBeenCalledWith("success", "true");
    expect(fg).toHaveBeenCalledWith("error", "false");
    expect(fg).toHaveBeenCalledWith("error", "null");
    expect(fg).toHaveBeenCalledWith("error", "Removed");
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
  const effective = layers({
    command: {
      verbosity: Verbosity.LOW,
      reasoningSummary: ReasoningSummary.NONE,
      webSearch: true,
      serviceTier: ServiceTier.PRIORITY,
    },
  });

  // Act
  const markdown = statusMarkdown(effective, { ...model, id: "o3" }, Destination.GLOBAL);

  // Assert
  expect(markdown).toContain("Skipped: Model support is limited to known GPT-5.5 and newer models");
  expect(markdown).not.toContain("Remove reasoning.summary");
});

it.each(["openai-responses", "unknown-api"])("shows payload-dependent behavior for %s with the unsafe flag", (api) => {
  // Arrange
  const effective = layers({
    command: {
      allowUnsupported: true,
      verbosity: Verbosity.LOW,
      reasoningSummary: ReasoningSummary.AUTO,
      webSearch: true,
      serviceTier: ServiceTier.PRIORITY,
    },
  });

  // Act
  const markdown = statusMarkdown(effective, { ...model, api }, Destination.GLOBAL);

  // Assert
  for (const setting of [Setting.VERBOSITY, Setting.REASONING_SUMMARY, Setting.WEB_SEARCH, Setting.SERVICE_TIER]) {
    const row = markdown
      .split("## Effective settings")[1]
      ?.split("\n")
      .find((line) => line.startsWith(`| ${setting} |`));
    expect(row).toContain("Attempt on compatible request payload (support checks bypassed)");
  }
  expect(markdown).not.toContain("Skipped:");
});

it.each([
  {
    provider: "azure",
    api: "azure-openai-responses",
    baseUrl: "https://example.openai.azure.com",
    id: "gpt-6-sol",
    search: "Add native web search if absent",
    tier: "Set service_tier to priority",
  },
  {
    provider: "azure",
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
  const effective = layers({
    command: {
      verbosity: Verbosity.LOW,
      reasoningSummary: ReasoningSummary.AUTO,
      webSearch: true,
      serviceTier: ServiceTier.PRIORITY,
    },
  });

  // Act
  const markdown = statusMarkdown(effective, { ...model, ...identity }, Destination.GLOBAL);

  // Assert
  expect(markdown).toContain("| verbosity | `low` | command | Set text.verbosity |");
  expect(markdown).toContain("| reasoningSummary | `auto` | command | Set reasoning.summary |");
  expect(markdown).toContain(`| webSearch | \`true\` | command | ${search} |`);
  expect(markdown).toContain(`| serviceTier | \`priority\` | command | ${tier} |`);
});

it.each([
  { identity: { id: "gpt-6-astra" }, behavior: "Set service_tier to ultrafast" },
  { identity: { id: "gpt-6.1-sol" }, behavior: "Set service_tier to ultrafast" },
  { identity: { id: "gpt-6-sol" }, behavior: "Skipped: Ultrafast support is unverified for this model" },
  {
    identity: {
      id: "gpt-6-astra",
      provider: "azure",
      api: "azure-openai-responses",
      baseUrl: "https://example.openai.azure.com",
    },
    behavior: "Skipped: Ultrafast support is unverified on this endpoint",
  },
  {
    identity: { id: "gpt-6-astra", provider: "github-copilot", baseUrl: "https://api.githubcopilot.com" },
    behavior: "Skipped: Ultrafast support is unverified on this endpoint",
  },
])("shows ultrafast eligibility and its bypass for $identity", ({ identity, behavior }) => {
  // Arrange
  const effective = layers({ command: { serviceTier: ServiceTier.ULTRAFAST } });
  const bypassed = layers({ command: { serviceTier: ServiceTier.ULTRAFAST, allowUnsupported: true } });
  const requestModel = { ...model, ...identity };

  // Act / Assert
  expect(statusMarkdown(effective, requestModel, Destination.GLOBAL)).toContain(
    `| serviceTier | \`ultrafast\` | command | ${behavior} |`,
  );
  expect(statusMarkdown(bypassed, requestModel, Destination.GLOBAL)).toContain(
    "| serviceTier | `ultrafast` | command | Attempt on compatible request payload (support checks bypassed) |",
  );
});

it("shows all scopes, matching markers, provenance, and a final effective table", () => {
  // Arrange
  const input = layers({
    global: {
      verbosity: Verbosity.HIGH,
      overrides: [
        { match: { model: "other" }, settings: { enabled: false } },
        { match: { provider: model.provider }, settings: { verbosity: Verbosity.LOW, webSearch: true } },
      ],
    },
    project: { overrides: [{ match: { provider: model.provider }, settings: { verbosity: Verbosity.MEDIUM } }] },
  });

  // Act
  const markdown = statusMarkdown(input, model, Destination.PROJECT);

  // Assert
  expect(markdown).toContain("### All models");
  expect(markdown).toContain("### `model=other`");
  expect(markdown).toContain("Does not match selected model");
  expect(markdown.match(/### `provider=openai`/g)).toHaveLength(1);
  expect(markdown).toContain("Default command target: `provider=openai`");
  expect(markdown).toContain("| verbosity | `medium` | project |");
  const effective = markdown.split("## Effective settings")[1];
  expect(effective).toContain("| verbosity | `medium` | project | Set text.verbosity | `provider=openai` |");
  expect(effective).toContain("| webSearch | `true` | global |");
  expect(effective).toContain("| enabled | `true` | default |");
});

it("keeps saved-only receipts out of the default target and effective values", () => {
  // Arrange
  const input = layers({ command: { verbosity: Verbosity.LOW } });
  const changes = {
    pending: [{ destination: Destination.GLOBAL, match: {}, settings: { verbosity: Verbosity.LOW } }],
    receipts: [
      {
        destination: Destination.PROJECT,
        match: { model: model.id },
        settings: { verbosity: Verbosity.HIGH },
      },
    ],
  };

  // Act
  const markdown = statusMarkdown(input, model, Destination.PROJECT, changes);

  // Assert
  expect(markdown).toContain("command, unsaved");
  expect(markdown).toContain("Saved only; not loaded");
  expect(markdown).toContain("Saved to **project** for next session/reload (not loaded)");
  expect(markdown).toContain("| verbosity | `high` |");
  expect(markdown).toContain("Default command target: `All models`");
  expect(markdown.split("## Effective settings")[1]).toContain("| verbosity | `low` | command |");
  expect(markdown.split("## Effective settings")[1]).not.toContain("`high`");
});

it("escapes configured selectors in every scope heading and table", () => {
  // Arrange
  const input = layers({
    global: {
      overrides: [
        {
          match: { model: "bad`|\n\u001b[31m\\value" },
          settings: { verbosity: Verbosity.LOW },
        },
      ],
    },
  });

  // Act
  const markdown = statusMarkdown(input, model, Destination.GLOBAL);

  // Assert
  expect(markdown).toContain("model=bad????[31m?value");
  expect(markdown).not.toContain("\u001b");
});

it("lists all unsaved edits in a Temporary section immediately before effective settings", () => {
  // Arrange
  const input = layers({ global: { reasoningSummary: ReasoningSummary.AUTO } });
  const changes: Changes = { pending: [], receipts: [] };
  setCommand(input, changes, { model: model.id }, { verbosity: Verbosity.LOW }, Destination.GLOBAL);
  setCommand(
    input,
    changes,
    { provider: model.provider },
    { verbosity: Verbosity.HIGH, webSearch: false },
    Destination.GLOBAL,
  );
  setCommand(input, changes, { model: "other" }, { verbosity: null }, Destination.GLOBAL);
  setCommand(input, changes, {}, { enabled: false }, Destination.GLOBAL);
  const before = structuredClone(changes);

  // Act
  const markdown = statusMarkdown(input, model, Destination.GLOBAL, changes);
  const temporary = markdown.split("## Temporary\n")[1]?.split("## Effective settings")[0];

  // Assert
  expect(markdown.indexOf("## Temporary")).toBeGreaterThan(markdown.indexOf("### `model=other`"));
  expect(temporary).not.toContain("##");
  expect(temporary).toContain("| `All models` | enabled | `false` | global | Yes |");
  expect(temporary).toContain("| `provider=openai` | verbosity | `high` | global | Yes |");
  expect(temporary).toContain("| `provider=openai` | webSearch | `false` | global | Yes |");
  expect(temporary).toContain("| `model=gpt-6-sol` | verbosity | `low` | global | Yes |");
  expect(temporary).toContain("| `model=other` | verbosity | `null` | global | No |");
  expect(temporary).not.toContain("reasoningSummary");
  expect(temporary).toContain("\n\nUse `/pi-openai save` to save the changes.\n");
  expect(markdown).not.toContain("Pending save groups");
  expect(changes).toEqual(before);
});

it.each(["save", "undo"])("shows no unsaved edits after %s without hiding saved runtime values", (action) => {
  // Arrange
  const input = layers();
  const changes: Changes = { pending: [], receipts: [] };
  setCommand(input, changes, {}, { verbosity: Verbosity.LOW }, Destination.GLOBAL);

  // Act
  if (action === "save") {
    completeSave(changes, prepareSave(changes));
  } else {
    undoCommand(input, changes);
  }
  const markdown = statusMarkdown(input, model, Destination.GLOBAL, changes);
  const temporary = markdown.split("## Temporary\n")[1]?.split("## Effective settings")[0];

  // Assert
  expect(temporary?.trim()).toBe("No unsaved command edits.");
  expect(markdown).not.toContain("Use `/pi-openai save` to save the changes.");
  if (action === "save") {
    expect(markdown).toContain("| verbosity | `low` | command, saved |");
  } else {
    expect(markdown).toContain("| verbosity | `null` | default |");
  }
});

it("escapes temporary scopes and handles pending edits without a selected model", () => {
  // Arrange
  const input = layers();
  const changes: Changes = { pending: [], receipts: [] };
  setCommand(input, changes, { model: "bad`|\n\u001b[31m\\value" }, { verbosity: Verbosity.LOW }, Destination.GLOBAL);
  setCommand(input, changes, {}, { webSearch: true }, Destination.GLOBAL);

  // Act
  const markdown = statusMarkdown(input, undefined, Destination.GLOBAL, changes);
  const temporary = markdown.split("## Temporary\n")[1]?.split("## Effective settings")[0];

  // Assert
  expect(temporary).toContain("| `model=bad????[31m?value` | verbosity | `low` | global | No |");
  expect(temporary).toContain("| `All models` | webSearch | `true` | global | Yes |");
  expect(temporary).not.toContain("\u001b");
});

it("shows pending removals separately from explicit null values without changing effective settings", () => {
  // Arrange
  const input = layers({ global: { verbosity: Verbosity.HIGH } });
  const changes: Changes = { pending: [], receipts: [] };
  unsetCommand(input, changes, {}, Setting.VERBOSITY, Destination.GLOBAL);
  setCommand(input, changes, {}, { reasoningSummary: null }, Destination.GLOBAL);

  // Act
  const markdown = statusMarkdown(input, model, Destination.GLOBAL, changes);
  const temporary = markdown.split("## Temporary\n")[1]?.split("## Effective settings")[0];

  // Assert
  expect(temporary).toContain("| `All models` | verbosity | `Removed` | global | Yes |");
  expect(temporary).toContain("| `All models` | reasoningSummary | `null` | global | Yes |");
  expect(temporary).toContain("Removals affect their recorded source on next session/reload");
  expect(temporary).toContain("\n\nUse `/pi-openai save` to save the changes.\n");
  expect(markdown.split("## Effective settings")[1]).toContain("| verbosity | `high` | global |");
});

it("shows saved removals as receipts rather than values or unsaved edits", () => {
  // Arrange
  const input = layers({ global: { verbosity: Verbosity.HIGH } });
  const changes: Changes = { pending: [], receipts: [] };
  unsetCommand(input, changes, { model: model.id }, Setting.VERBOSITY, Destination.GLOBAL);
  completeSave(changes, prepareSave(changes));

  // Act
  const markdown = statusMarkdown(input, model, Destination.GLOBAL, changes);

  // Assert
  expect(markdown).toContain("Saved only; not loaded");
  expect(markdown).toContain("| verbosity | `Removed` |");
  expect(markdown).toContain("No unsaved command edits.");
  expect(markdown).not.toContain("Use `/pi-openai save` to save the changes.");
  expect(markdown.split("## Effective settings")[1]).toContain("| verbosity | `high` | global |");
});

it("keeps pending removal scopes available as the default command target", () => {
  // Arrange
  const input = layers();
  const changes: Changes = { pending: [], receipts: [] };
  unsetCommand(input, changes, { model: model.id }, Setting.VERBOSITY, Destination.GLOBAL);

  // Act
  const markdown = statusMarkdown(input, model, Destination.GLOBAL, changes);

  // Assert
  expect(markdown).toContain("Default command target: `model=gpt-6-sol`");
  expect(markdown).toContain("| `model=gpt-6-sol` | verbosity | `Removed` | global | Yes |");
});

it.each([Destination.GLOBAL, Destination.PROJECT] as const)(
  "shows the recorded %s source for pending additions and removals",
  (destination) => {
    // Arrange
    const input = layers({ global: { verbosity: Verbosity.HIGH } });
    const changes: Changes = { pending: [], receipts: [] };
    unsetCommand(input, changes, {}, Setting.VERBOSITY, destination);
    setCommand(input, changes, { model: model.id }, { webSearch: true }, destination);

    // Act
    const markdown = statusMarkdown(input, model, destination === "global" ? "project" : "global", changes);
    const temporary = markdown.split("## Temporary\n")[1]?.split("## Effective settings")[0];

    // Assert
    expect(temporary).toContain("| Scope | Setting | Value | Source | Matches selected model |");
    expect(temporary).toContain(`| \`All models\` | verbosity | \`Removed\` | ${destination} | Yes |`);
    expect(temporary).toContain(`| \`model=gpt-6-sol\` | webSearch | \`true\` | ${destination} | Yes |`);
  },
);

it("distinguishes same-scope sources and does not mark a saved runtime value as an older pending value", () => {
  // Arrange
  const input = layers();
  const changes: Changes = { pending: [], receipts: [] };
  setCommand(input, changes, {}, { verbosity: Verbosity.LOW }, Destination.GLOBAL);
  setCommand(input, changes, {}, { verbosity: Verbosity.HIGH }, Destination.PROJECT);
  completeSave(changes, prepareSave(changes, { source: Destination.PROJECT }));

  // Act
  const markdown = statusMarkdown(input, model, Destination.PROJECT, changes);

  // Assert
  expect(markdown).toContain("| verbosity | `high` | command, saved |");
  expect(markdown).toContain("| `All models` | verbosity | `low` | global | Yes |");
  expect(markdown).toContain("Saved to **project** for next session/reload");
});

it("shows separate pending project and global removals of the same scoped setting", () => {
  // Arrange
  const input = layers();
  const changes: Changes = { pending: [], receipts: [] };
  unsetCommand(input, changes, { model: model.id }, Setting.VERBOSITY, Destination.PROJECT);
  unsetCommand(input, changes, { model: model.id }, Setting.VERBOSITY, Destination.GLOBAL);

  // Act
  const markdown = statusMarkdown(input, model, Destination.PROJECT, changes);
  const temporary = markdown.split("## Temporary\n")[1]?.split("## Effective settings")[0];

  // Assert
  expect(temporary).toContain("| `model=gpt-6-sol` | verbosity | `Removed` | project | Yes |");
  expect(temporary).toContain("| `model=gpt-6-sol` | verbosity | `Removed` | global | Yes |");
});
