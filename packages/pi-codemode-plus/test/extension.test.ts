import { fileURLToPath } from "node:url";
import {
  createCodemodeExtension,
  DefaultResourceLoader,
  SettingsManager,
  type ExtensionAPI,
  type ExtensionContext,
  type ToolRendererResolver,
  type ToolRenderers,
} from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/shared/events";
import { beforeAll, expect, it, vi } from "vitest";
import codemodePlus from "#src/index";
import { renderCall, renderResult, resultFor, upstreamRenderers } from "#test/render-harness";
import { useWorkspace } from "#test/workspace";

const workspace = useWorkspace();
let upstream: ToolRenderers;
beforeAll(async () => {
  upstream = await upstreamRenderers();
});

function harness() {
  let resolver: ToolRendererResolver | undefined;
  const handlers = new Map<string, (event: never, ctx: ExtensionContext) => unknown>();
  const notify = vi.fn();
  const isProjectTrusted = vi.fn(() => true);
  const registerTool = vi.fn();
  codemodePlus({
    on(name: string, handler: (event: never, ctx: ExtensionContext) => unknown) {
      handlers.set(name, handler);
    },
    registerToolRenderer(value: ToolRendererResolver) {
      resolver = value;
    },
    registerTool,
  } as unknown as ExtensionAPI);
  return {
    notify,
    isProjectTrusted,
    registerTool,
    resolve(name = "codemode", base: ToolRenderers | undefined = upstream) {
      if (!resolver) {
        throw new Error("Missing renderer resolver");
      }
      return resolver(name, () => base);
    },
    async start() {
      const handler = handlers.get(Events.SessionStart);
      if (!handler) {
        throw new Error("Missing session handler");
      }
      await handler(
        {} as never,
        {
          cwd: workspace.cwd,
          hasUI: true,
          isProjectTrusted,
          ui: { notify },
        } as unknown as ExtensionContext,
      );
    },
  };
}

it("enables the UI features at session start without registering a tool", async () => {
  // Arrange
  const extension = harness();
  const renderers = extension.resolve();
  expect(renderers).toBeDefined();

  // Act
  await extension.start();

  // Assert
  expect(renderCall(renderers!)).toContain("const line25");
  expect(renderCall(renderers!)).not.toMatch(/^codemode\n/);
  expect(renderResult(renderers!, resultFor('{"name":"Alice"}'))).toBe("name: Alice");
  expect(extension.registerTool).not.toHaveBeenCalled();
});

it("leaves other tools and absent renderers alone", () => {
  // Arrange
  const extension = harness();

  // Act / Assert
  expect(extension.resolve("bash")).toBe(upstream);
  expect(extension.resolve("read")).toBe(upstream);
  expect(extension.resolve("codemode", {})).toEqual({});
});

it("uses fresh configuration even for renderers resolved before a session reload", async () => {
  // Arrange
  const extension = harness();
  const renderers = extension.resolve()!;
  await extension.start();
  expect(renderCall(renderers)).toContain("const line25");
  await workspace.configure('{"enabled":false}');

  // Act
  await extension.start();

  // Assert
  expect(renderCall(renderers)).toBe(renderCall(upstream));
  expect(renderResult(renderers, resultFor('{"x":1}'))).toBe('{"x":1}');
});

it("changes each feature independently", async () => {
  // Arrange
  const extension = harness();
  const renderers = extension.resolve()!;
  await workspace.configure('{"showFullScript":false}');
  await extension.start();

  // Act / Assert
  expect(renderCall(renderers)).toBe(renderCall(upstream).replace(/^codemode\n/, ""));
  expect(renderResult(renderers, resultFor('{"x":1}'))).toBe("x: 1");

  // Arrange
  await workspace.configure('{"prettyPrintOutput":false}');

  // Act
  await extension.start();

  // Assert
  expect(renderCall(renderers)).toContain("const line25");
  expect(renderResult(renderers, resultFor('{"x":1}'))).toBe('{"x":1}');
});

it("restores the header on reload without changing the other features", async () => {
  // Arrange
  const extension = harness();
  const renderers = extension.resolve()!;
  await extension.start();
  const hidden = renderCall(renderers);
  await workspace.configure('{"hideHeader":false}');

  // Act
  await extension.start();

  // Assert
  expect(hidden).not.toMatch(/^codemode\n/);
  expect(renderCall(renderers)).toBe("codemode\n" + hidden);
  expect(renderCall(renderers)).toContain("const line25");
  expect(renderResult(renderers, resultFor('{"x":1}'))).toBe("x: 1");
});

it("disables overrides if loading configuration fails", async () => {
  // Arrange
  const extension = harness();
  const renderers = extension.resolve()!;
  await extension.start();
  await workspace.configure('{"enabled":"invalid"}');

  // Act / Assert
  await expect(extension.start()).rejects.toThrow("enabled must be a boolean");
  expect(renderCall(renderers)).toBe(renderCall(upstream));
});

it("honors project trust when reloading configuration", async () => {
  // Arrange
  await workspace.configure('{"enabled":false}', true);
  await workspace.configure("{}");
  const extension = harness();
  const renderers = extension.resolve()!;
  await extension.start();
  expect(renderCall(renderers)).toContain("const line25");
  extension.isProjectTrusted.mockReturnValue(false);

  // Act
  await extension.start();

  // Assert
  expect(renderCall(renderers)).toBe(renderCall(upstream));
});

it("reports unknown configuration keys through Pi's UI", async () => {
  // Arrange
  await workspace.configure('{"prettyPrints":true}');
  const extension = harness();

  // Act
  await extension.start();

  // Assert
  expect(extension.notify).toHaveBeenCalledWith(expect.stringContaining('"prettyPrints"'), "warning");
});

it("loads through Pi's TypeScript loader alongside built-in codemode", async () => {
  // Arrange
  const loader = new DefaultResourceLoader({
    cwd: workspace.cwd,
    agentDir: workspace.agentDir,
    settingsManager: SettingsManager.inMemory(),
    noSkills: true,
    noThemes: true,
    noPromptTemplates: true,
    noContextFiles: true,
    additionalExtensionPaths: [fileURLToPath(new URL("..", import.meta.url))],
    extensionFactories: [{ name: "codemode", builtin: true, replaceable: true, factory: createCodemodeExtension() }],
  });

  // Act
  await loader.reload();
  const result = loader.getExtensions();

  // Assert
  expect(result.errors).toEqual([]);
  expect(result.extensions.some((extension) => extension.path === "builtin:codemode")).toBe(true);
  expect(result.extensions.filter((extension) => extension.tools.has("codemode"))).toHaveLength(1);
  expect(result.extensions.filter((extension) => extension.toolRenderers?.length === 1)).toHaveLength(1);
});
