import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createCodemodeExtension,
  DefaultResourceLoader,
  SettingsManager,
  type ExtensionAPI,
  type ExtensionContext,
  type ToolDefinition,
  type ToolRendererResolver,
  type ToolRenderers,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "#src/config";
import codemodePlus from "#src/index";

type ResultRenderer = NonNullable<ToolRenderers["renderResult"]>;
const raw = '{"output":"hello\\nworld\\n","truncated":false,"exit_code":0,"wall_time_seconds":0.1}';
const pretty = "hello\nworld\n\nExit: 0 | Time: 0.1s | Truncated: no";
let directory: string;
let project: string;
let agentDir: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "codemode-plus-"));
  project = join(directory, "workspace");
  agentDir = join(directory, "agent");
  await mkdir(join(project, ".pi"), { recursive: true });
  await mkdir(agentDir);
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

async function configure(source: string, global = false): Promise<void> {
  await writeFile(join(global ? agentDir : join(project, ".pi"), "pi-codemode-plus.jsonc"), source);
}

function harness() {
  const handlers = new Map<string, (event: never, ctx: ExtensionContext) => unknown>();
  const resolvers: ToolRendererResolver[] = [];
  const component = { render: () => ["rendered"], invalidate() {} };
  const renderResult = vi.fn<ResultRenderer>(() => component);
  const renderCall = vi.fn<NonNullable<ToolRenderers["renderCall"]>>(() => component);
  const base: ToolRenderers = { renderResult, renderCall, renderShell: "self" };
  const notify = vi.fn();
  const isProjectTrusted = vi.fn(() => true);
  const api = {
    on(name: string, handler: (event: never, ctx: ExtensionContext) => unknown) {
      handlers.set(name, handler);
    },
    registerToolRenderer(resolver: ToolRendererResolver) {
      resolvers.push(resolver);
    },
  } as unknown as ExtensionAPI;
  codemodePlus(api);
  const resolver = resolvers[0];
  if (!resolver) {
    throw new Error("Missing renderer resolver");
  }
  const context = { cwd: project, isProjectTrusted, ui: { notify } } as unknown as ExtensionContext;
  const resolve = (name = "codemode", renderers: ToolRenderers = base) => resolver(name, () => renderers);
  const wrapped = resolve()?.renderResult;
  if (!wrapped) {
    throw new Error("Missing result renderer");
  }

  return {
    handlers,
    base,
    notify,
    isProjectTrusted,
    resolve,
    resolver,
    renderResult,
    renderCall,
    component,
    async start() {
      await handlers.get("session_start")?.({} as never, context);
    },
    render(result: Parameters<ResultRenderer>[0], isPartial = false) {
      return wrapped(
        result,
        { expanded: true, isPartial },
        {} as Parameters<ResultRenderer>[2],
        {} as Parameters<ResultRenderer>[3],
      );
    },
  };
}

function resultFixture(): Parameters<ResultRenderer>[0] {
  return {
    content: [
      { type: "text", text: "Script completed\nWall time 0.1 seconds\nOutput:\n" },
      { type: "text", text: `==> text 1/2 <==\nfile contents\n==> text 2/2 <==\n${raw}` },
      { type: "image", data: "image-data", mimeType: "image/png" },
    ],
    details: { calls: [], fullOutputPath: "/tmp/codemode-output.txt" },
    structuredContent: { original: true },
  };
}

describe("renderer integration", () => {
  it("passes a display-only copy to the existing renderer", async () => {
    // Arrange
    const extension = harness();
    await extension.start();
    const result = resultFixture();
    const original = structuredClone(result);
    result.content.forEach(Object.freeze);
    Object.freeze(result.content);
    Object.freeze(result);

    // Act
    const component = extension.render(result);
    const displayed = extension.renderResult.mock.calls[0]?.[0];

    // Assert
    expect(component).toBe(extension.component);
    expect(displayed).toEqual({
      ...original,
      content: [
        original.content[0],
        { type: "text", text: `==> text 1/2 <==\nfile contents\n==> text 2/2 <==\n${pretty}` },
        original.content[2],
      ],
    });
    expect(displayed).not.toBe(result);
    expect(displayed?.content[0]).toBe(result.content[0]);
    expect(displayed?.content[2]).toBe(result.content[2]);
    expect(displayed?.details).toBe(result.details);
    expect(displayed?.structuredContent).toBe(result.structuredContent);
    expect(result).toEqual(original);
    expect([...extension.handlers.keys()]).toEqual(["session_start"]);
  });

  it.each(["bash", "read", "write", "other-extension"])("does not replace the %s renderer", (name) => {
    // Arrange
    const extension = harness();

    // Act / Assert
    expect(extension.resolve(name)).toBe(extension.base);
  });

  it("preserves call and shell rendering and handles absent renderers", () => {
    // Arrange
    const extension = harness();

    // Act / Assert
    expect(extension.resolve()?.renderCall).toBe(extension.base.renderCall);
    expect(extension.resolve()?.renderShell).toBe("self");
    expect(extension.resolver("codemode", () => undefined)).toBeUndefined();
    const callOnly = { renderCall: extension.renderCall };
    expect(extension.resolve("codemode", callOnly)).toBe(callOnly);
  });

  it.each(['{"enabled":false}', '{"prettyBash":false}'])("passes results through for %s", async (config) => {
    // Arrange
    await configure(config);
    const extension = harness();
    await extension.start();
    const result = resultFixture();

    // Act
    extension.render(result);

    // Assert
    expect(extension.renderResult.mock.calls[0]?.[0]).toBe(result);
  });

  it("passes results through before config loads and during partial rendering", async () => {
    // Arrange
    const extension = harness();
    const result = resultFixture();

    // Act
    extension.render(result);
    await extension.start();
    extension.render(result, true);

    // Assert
    expect(extension.renderResult.mock.calls.map(([value]) => value)).toEqual([result, result]);
    expect(extension.renderResult.mock.calls.every(([value]) => value === result)).toBe(true);
  });

  it("passes unrelated codemode content through without cloning", async () => {
    // Arrange
    const extension = harness();
    await extension.start();
    const result = { content: [{ type: "text" as const, text: "Read some text" }], details: undefined };

    // Act
    extension.render(result);

    // Assert
    expect(extension.renderResult.mock.calls[0]?.[0]).toBe(result);
  });

  it("updates already resolved renderers after configuration reload", async () => {
    // Arrange
    const extension = harness();
    await extension.start();
    const result = resultFixture();
    extension.render(result);
    await configure('{"enabled":false}');

    // Act
    await extension.start();
    extension.render(result);
    await configure("{}");
    await extension.start();
    extension.render(result);

    // Assert
    const inputs = extension.renderResult.mock.calls.map(([value]) => value);
    expect(inputs[0]).not.toBe(result);
    expect(inputs[1]).toBe(result);
    expect(inputs[2]).not.toBe(result);
  });

  it("disables formatting if a configuration reload fails", async () => {
    // Arrange
    const extension = harness();
    await extension.start();
    await configure('{"prettyBash":null}');
    const result = resultFixture();

    // Act / Assert
    await expect(extension.start()).rejects.toThrow("prettyBash must be a boolean");
    extension.render(result);
    expect(extension.renderResult.mock.calls[0]?.[0]).toBe(result);
  });
});

describe("JSONC configuration", () => {
  it("defaults both options to true", async () => {
    // Act / Assert
    await expect(loadConfig(project, { projectTrusted: true })).resolves.toEqual({ enabled: true, prettyBash: true });
  });

  it("reads global JSONC and uses project configuration without merging", async () => {
    // Arrange
    await configure('{ // global\n "enabled": false, "prettyBash": false, }', true);

    // Act
    const global = await loadConfig(project, { projectTrusted: true });
    await configure('{"prettyBash":false}');
    const local = await loadConfig(project, { projectTrusted: true });

    // Assert
    expect(global).toEqual({ enabled: false, prettyBash: false });
    expect(local).toEqual({ enabled: true, prettyBash: false });
  });

  it.each([
    ['{"enabled":"yes"}', "enabled must be a boolean"],
    ['{"prettyBash":1}', "prettyBash must be a boolean"],
    ["{", "invalid configuration"],
  ])("rejects invalid configuration %s", async (source, message) => {
    // Arrange
    await configure(source);

    // Act / Assert
    await expect(loadConfig(project, { projectTrusted: true })).rejects.toThrow(message);
  });

  it("warns about unknown keys while applying known settings", async () => {
    // Arrange
    await configure('{"prettyBash":false,"prettybash":true}');
    const extension = harness();

    // Act
    await extension.start();

    // Assert
    expect(extension.notify).toHaveBeenCalledWith(
      expect.stringContaining('Unknown configuration entries: "prettybash"'),
      "warning",
    );
    const result = resultFixture();
    extension.render(result);
    expect(extension.renderResult.mock.calls[0]?.[0]).toBe(result);
  });

  it("ignores an invalid untrusted project file and uses global settings", async () => {
    // Arrange
    await configure("{invalid");
    await configure('{"enabled":false}', true);
    const extension = harness();
    extension.isProjectTrusted.mockReturnValue(false);

    // Act
    await extension.start();
    const result = resultFixture();
    extension.render(result);

    // Assert
    expect(extension.notify).not.toHaveBeenCalled();
    expect(extension.renderResult.mock.calls[0]?.[0]).toBe(result);
  });
});

it("loads through Pi's TypeScript extension loader", async () => {
  // Arrange
  const loader = new DefaultResourceLoader({
    cwd: project,
    agentDir,
    settingsManager: SettingsManager.inMemory(),
    noSkills: true,
    noThemes: true,
    noPromptTemplates: true,
    noContextFiles: true,
    additionalExtensionPaths: [fileURLToPath(new URL("../src/index.ts", import.meta.url))],
  });

  // Act
  await loader.reload();
  const extensions = loader.getExtensions();

  // Assert
  expect(extensions.errors).toEqual([]);
  expect(extensions.extensions.some((extension) => extension.toolRenderers?.length === 1)).toBe(true);
});

it.each([false, true])("works with Pi's actual codemode renderer when expanded=%s", async (expanded) => {
  // Arrange
  let baseline: ToolRenderers | undefined;
  await createCodemodeExtension()({
    registerTool(tool: ToolDefinition) {
      baseline = tool;
    },
  } as ExtensionAPI);
  if (!baseline) {
    throw new Error("Missing built-in codemode renderer");
  }
  const extension = harness();
  await extension.start();
  const render = extension.resolve("codemode", baseline)?.renderResult;
  if (!render) {
    throw new Error("Missing wrapped codemode renderer");
  }
  const result = {
    content: [
      { type: "text" as const, text: "Script completed\nWall time 0.1 seconds\nOutput:\n" },
      { type: "text" as const, text: raw },
    ],
    details: { calls: [] },
  };
  const theme = { fg: (_color: unknown, text: string) => text } as Parameters<ResultRenderer>[2];
  const context = { showImages: false, isError: false } as Parameters<ResultRenderer>[3];

  // Act
  const component = render(result, { expanded, isPartial: false }, theme, context);
  const lines = component.render(120).map((line) => line.trimEnd());

  // Assert
  expect(lines.join("\n")).toContain(pretty);
  expect(lines.join("\n")).not.toContain("Script completed");
  expect(lines.join("\n")).not.toContain('"output":');
  expect(result.content[1]?.text).toBe(raw);
});
