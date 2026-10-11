import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/shared/events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadConfig } from "#src/config";
import tytooCodemode from "#src/index";

let root: string;
let cwd: string;
let agentDir: string;
let globalFile: string;
let projectFile: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "codemode-config-"));
  cwd = join(root, "project");
  agentDir = join(root, "agent");
  globalFile = join(agentDir, "pi-tytoo-codemode.jsonc");
  projectFile = join(cwd, ".pi", "pi-tytoo-codemode.jsonc");
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  await Promise.all([mkdir(join(cwd, ".pi"), { recursive: true }), mkdir(agentDir)]);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

it("enables pretty results without configuration", async () => {
  // Act / Assert
  await expect(loadConfig(cwd, { projectTrusted: true })).resolves.toEqual({ prettyResults: true });
});

it("reads global JSONC with comments and trailing commas", async () => {
  // Arrange
  await writeFile(globalFile, '{ // rendering\n "prettyResults": false, }');

  // Act / Assert
  await expect(loadConfig(cwd, { projectTrusted: true })).resolves.toEqual({ prettyResults: false });
});

it.each([true, false])("lets project configuration override global configuration: %s", async (prettyResults) => {
  // Arrange
  await writeFile(globalFile, JSON.stringify({ prettyResults: !prettyResults }));
  await writeFile(projectFile, JSON.stringify({ prettyResults }));

  // Act / Assert
  await expect(loadConfig(cwd, { projectTrusted: true })).resolves.toEqual({ prettyResults });
});

it("uses defaults for omitted project settings instead of merging global configuration", async () => {
  // Arrange
  await writeFile(globalFile, '{"prettyResults":false}');
  await writeFile(projectFile, "{}");

  // Act / Assert
  await expect(loadConfig(cwd, { projectTrusted: true })).resolves.toEqual({ prettyResults: true });
});

it.each(['{"prettyResults":true}', "{invalid"])("ignores untrusted project configuration: %s", async (source) => {
  // Arrange
  await writeFile(globalFile, '{"prettyResults":false}');
  await writeFile(projectFile, source);

  // Act / Assert
  await expect(loadConfig(cwd, { projectTrusted: false })).resolves.toEqual({ prettyResults: false });
});

it.each(["null", "[]", "{", '{"prettyResults":"true"}', '{"prettyResults":0}', '{"prettyResults":null}'])(
  "rejects invalid project configuration without falling back: %s",
  async (source) => {
    // Arrange
    await writeFile(globalFile, '{"prettyResults":true}');
    await writeFile(projectFile, source);

    // Act / Assert
    await expect(loadConfig(cwd, { projectTrusted: true })).rejects.toThrow(
      `pi-tytoo-codemode: invalid configuration in ${projectFile}:`,
    );
  },
);

it("warns about unknown configuration keys", async () => {
  // Arrange
  const notify = vi.fn();
  await writeFile(projectFile, '{"prettyResult":false}');

  // Act
  const config = await loadConfig(cwd, { projectTrusted: true, ui: { notify } });

  // Assert
  expect(config).toEqual({ prettyResults: true });
  expect(notify).toHaveBeenCalledExactlyOnceWith(
    `pi-tytoo-codemode: ${projectFile}: Unknown configuration entries: "prettyResult".`,
    "warning",
  );
});

function extension() {
  const handlers = new Map<string, (event: never, ctx: ExtensionContext) => unknown>();
  const registerTool = vi.fn<ExtensionAPI["registerTool"]>();
  tytooCodemode({
    registerTool,
    on(name: string, handler: (event: never, ctx: ExtensionContext) => unknown) {
      handlers.set(name, handler);
    },
  } as unknown as ExtensionAPI);
  const context = {
    cwd,
    isProjectTrusted: () => true,
    ui: { notify: vi.fn() },
  } as unknown as ExtensionContext;
  const start = handlers.get(Events.SessionStart);
  const render = registerTool.mock.calls[0]?.[0].renderResult;
  if (!start || !render) {
    throw new Error("Missing extension handler or renderer");
  }
  return {
    start: () => start({} as never, context),
    render: () =>
      render(
        { content: [{ type: "text", text: '{"name":"Alice"}' }], details: { calls: [] } },
        { expanded: true, isPartial: false },
        { fg: (_color: unknown, text: string) => text } as Parameters<typeof render>[2],
        { showImages: false, isError: false } as Parameters<typeof render>[3],
      )
        .render(80)
        .join("\n"),
  };
}

it("loads configuration on session start and updates the registered renderer on reload", async () => {
  // Arrange
  const tool = extension();
  await writeFile(globalFile, '{"prettyResults":false}');

  // Act / Assert
  expect(tool.render()).toContain("name: Alice");
  await tool.start();
  expect(tool.render()).toContain('{"name":"Alice"}');

  await writeFile(projectFile, '{"prettyResults":true}');
  await tool.start();
  expect(tool.render()).toContain("name: Alice");
  expect(tool.render()).not.toContain('{"name":"Alice"}');
});

it("keeps raw rendering available after a configuration error", async () => {
  // Arrange
  const tool = extension();
  await writeFile(projectFile, '{"prettyResults":"invalid"}');

  // Act / Assert
  await expect(tool.start()).rejects.toThrow("prettyResults must be a boolean");
  expect(tool.render()).toContain('{"name":"Alice"}');
});
